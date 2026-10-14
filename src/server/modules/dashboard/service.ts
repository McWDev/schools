import "server-only";

import { and, count, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import {
  auditEvents,
  branches,
  membershipBranches,
  roles,
  membershipRoles,
  schoolMemberships,
  users,
} from "@/server/db/schema";
import { visibleMembershipsFilter } from "@/server/modules/users/access-rules";
import { resolveBranchFilter, type BranchOption } from "@/server/tenancy/branch-filter";
import { hasPermission, withTenant, type TenantContext } from "@/server/tenancy/context";
import { ForbiddenError } from "@/server/tenancy/errors";

export interface ActivityItem {
  id: string;
  occurredAt: Date;
  actorName: string | null;
  action: string;
  outcome: "success" | "denied" | "failure";
}

/** Every field is present only when the viewer has the permission for it. */
export interface DashboardSummary {
  branch: BranchOption | null;
  myRoles: string[];
  branches?: { active: number };
  staff?: { active: number; pendingInvitations: number; noAccess: number };
  recentActivity?: ActivityItem[];
}

/**
 * Summary for the dashboard, computed with scoped queries only. A requested branch outside the
 * viewer's scope (or in another school) is refused, never silently widened or narrowed.
 */
export async function getDashboardSummary(
  db: Database,
  context: TenantContext,
  requestedBranchId: string | null,
): Promise<DashboardSummary> {
  const branch = requestedBranchId
    ? await resolveBranchFilter(db, context, requestedBranchId)
    : null;
  if (requestedBranchId && !branch)
    throw new ForbiddenError("That branch is not available to you.");

  return withTenant(db, context, async (tx) => {
    const summary: DashboardSummary = { branch, myRoles: [] };

    const mine = await tx
      .select({ name: roles.name })
      .from(membershipRoles)
      .innerJoin(
        roles,
        and(eq(roles.id, membershipRoles.roleId), eq(roles.schoolId, membershipRoles.schoolId)),
      )
      .where(
        and(
          eq(membershipRoles.schoolId, context.schoolId),
          eq(membershipRoles.membershipId, context.membershipId),
        ),
      )
      .orderBy(roles.name);
    summary.myRoles = mine.map((r) => r.name);

    if (hasPermission(context, "branches.read")) {
      const scope =
        branch !== null
          ? eq(branches.id, branch.id)
          : context.scope.kind === "branch"
            ? context.scope.branchIds.length
              ? inArray(branches.id, [...context.scope.branchIds])
              : sql`false`
            : undefined;
      const [row] = await tx
        .select({ n: count() })
        .from(branches)
        .where(and(eq(branches.schoolId, context.schoolId), eq(branches.status, "active"), scope));
      summary.branches = { active: row.n };
    }

    if (hasPermission(context, "users.read")) {
      // With a branch selected, count staff assigned to it plus school-wide staff.
      const inBranch = branch
        ? sql`(${schoolMemberships.scope} = 'school' or exists (
            select 1 from ${membershipBranches} mb
            where mb.membership_id = ${schoolMemberships.id} and mb.branch_id = ${branch.id}))`
        : undefined;
      const rows = await tx
        .select({
          status: schoolMemberships.status,
          invited: sql<boolean>`${users.status} = 'invited'`,
          n: count(),
        })
        .from(schoolMemberships)
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(
          and(visibleMembershipsFilter(context), ne(schoolMemberships.status, "removed"), inBranch),
        )
        .groupBy(schoolMemberships.status, sql`${users.status} = 'invited'`);
      const sum = (pick: (r: (typeof rows)[number]) => boolean) =>
        rows.filter(pick).reduce((total, r) => total + r.n, 0);
      summary.staff = {
        active: sum((r) => r.status === "active" && !r.invited),
        pendingInvitations: sum((r) => r.status === "active" && r.invited),
        noAccess: sum((r) => r.status === "suspended"),
      };
    }

    if (hasPermission(context, "audit.read")) {
      const events = await tx
        .select({
          id: auditEvents.id,
          occurredAt: auditEvents.occurredAt,
          actorName: users.displayName,
          action: auditEvents.action,
          outcome: auditEvents.outcome,
        })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .where(and(eq(auditEvents.schoolId, context.schoolId), isNotNull(auditEvents.action)))
        .orderBy(desc(auditEvents.occurredAt))
        .limit(8);
      summary.recentActivity = events;
    }

    return summary;
  });
}

/** Aggregate school counts for platform administrators (no school records are exposed). */
export async function getPlatformOverview(
  db: Database,
  user: { userId: string; isPlatformAdmin: boolean },
): Promise<{ total: number; byStatus: Record<string, number> } | null> {
  if (!user.isPlatformAdmin) return null;
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${user.userId}, true)`);
    return (
      await tx.execute<{ status: string; total: number }>(
        sql`select * from app.platform_school_counts()`,
      )
    ).rows;
  });
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.total]));
  return { total: rows.reduce((sum, r) => sum + r.total, 0), byStatus };
}

/** Plain-language description of an audit action for the activity feed. */
export function describeAction(action: string): string {
  const labels: Record<string, string> = {
    "branch.create": "created a branch",
    "branch.update": "updated a branch",
    "user.invite": "invited a staff member",
    "user.invite.resend": "re-sent an invitation",
    "user.roles.update": "changed a staff member's roles",
    "user.access.update": "changed a staff member's branch access",
    "user.deactivate": "removed a staff member's access",
    "user.reactivate": "restored a staff member's access",
    "user.profile.update": "updated a staff member's details",
  };
  return labels[action] ?? action.replaceAll(".", " ").replaceAll("_", " ");
}
