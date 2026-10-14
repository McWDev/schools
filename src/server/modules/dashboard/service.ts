import "server-only";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { resolveBranchFilter, type BranchOption } from "@/server/access/branch-filter";
import { hasPermission, withAccess, type AccessContext } from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import type { Database } from "@/server/db/client";
import { auditEvents, branches, roles, userRoles, users } from "@/server/db/schema";
import { visibleUsersFilter } from "@/server/modules/users/access-rules";

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

/** Administrative actions shown in the activity feed (sign-ins and profile edits are not). */
const ADMIN_ACTIONS = sql`(${auditEvents.action} like 'user.%' or ${auditEvents.action} like 'branch.%' or ${auditEvents.action} like 'school.%')`;

/**
 * Summary for the dashboard, computed with scoped queries only. A requested branch outside the
 * viewer's scope is refused, never silently widened or narrowed.
 */
export async function getDashboardSummary(
  db: Database,
  context: AccessContext,
  requestedBranchId: string | null,
): Promise<DashboardSummary> {
  const branch = requestedBranchId
    ? await resolveBranchFilter(db, context, requestedBranchId)
    : null;
  if (requestedBranchId && !branch) {
    throw new ForbiddenError("That branch is not available to you.");
  }

  return withAccess(db, context, async (tx) => {
    const summary: DashboardSummary = { branch, myRoles: [] };

    const mine = await tx
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, context.userId))
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
        .where(and(eq(branches.status, "active"), scope));
      summary.branches = { active: row.n };
    }

    if (hasPermission(context, "users.read")) {
      // With a branch selected, count staff assigned to it plus school-wide staff.
      const inBranch = branch
        ? sql`(${users.accessScope} = 'school' or exists (
            select 1 from user_branches ub where ub.user_id = ${users.id} and ub.branch_id = ${branch.id}))`
        : undefined;
      const rows = await tx
        .select({ status: users.status, n: count() })
        .from(users)
        .where(and(visibleUsersFilter(context), inBranch))
        .groupBy(users.status);
      const of = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
      summary.staff = {
        active: of("active"),
        pendingInvitations: of("invited"),
        noAccess: of("deactivated") + of("suspended"),
      };
    }

    if (hasPermission(context, "audit.read")) {
      summary.recentActivity = await tx
        .select({
          id: auditEvents.id,
          occurredAt: auditEvents.occurredAt,
          actorName: users.displayName,
          action: auditEvents.action,
          outcome: auditEvents.outcome,
        })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorUserId))
        .where(ADMIN_ACTIONS)
        .orderBy(desc(auditEvents.occurredAt))
        .limit(8);
    }

    return summary;
  });
}

/** Plain-language description of an audit action for the activity feed. */
export function describeAction(action: string): string {
  const labels: Record<string, string> = {
    "branch.create": "opened a branch",
    "branch.update": "updated a branch",
    "school.settings.update": "updated the school profile",
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
