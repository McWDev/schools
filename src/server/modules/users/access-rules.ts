import "server-only";

import { and, eq, inArray, sql, type SQL } from "drizzle-orm";

import type { Transaction } from "@/server/db/client";
import { branches, rolePermissions, roles, schoolMemberships } from "@/server/db/schema";
import type { TenantContext } from "@/server/tenancy/context";
import { ForbiddenError } from "@/server/tenancy/errors";
import type { PermissionCode } from "@/server/tenancy/permissions";

export type AccessGrant = { scope: "school" } | { scope: "branch"; branchIds: string[] };

/**
 * Memberships the actor may see and manage. A school-scoped actor sees every membership of the
 * school. A branch-scoped actor sees only branch-scoped memberships whose branches all lie
 * inside the actor's own branches, so a branch admin can never reach a school-wide admin or
 * someone who also works at another branch.
 */
export function visibleMembershipsFilter(context: TenantContext): SQL {
  const inSchool = eq(schoolMemberships.schoolId, context.schoolId);
  if (context.scope.kind === "school") return inSchool;
  const mine = context.scope.branchIds;
  if (mine.length === 0) return sql`false`;
  const myBranches = sql`array[${sql.join(
    mine.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  return and(
    inSchool,
    eq(schoolMemberships.scope, "branch"),
    sql`exists (select 1 from membership_branches mb where mb.membership_id = ${schoolMemberships.id})`,
    sql`not exists (
      select 1 from membership_branches mb
      where mb.membership_id = ${schoolMemberships.id} and mb.branch_id <> all (${myBranches})
    )`,
  )!;
}

/** The actor may only hand out access they hold themselves. */
export async function assertCanGrantAccess(
  tx: Transaction,
  context: TenantContext,
  access: AccessGrant,
): Promise<void> {
  if (access.scope === "school") {
    if (context.scope.kind !== "school") {
      throw new ForbiddenError("Only school-wide administrators can grant access to every branch.");
    }
    return;
  }
  const requested = [...new Set(access.branchIds)];
  if (context.scope.kind === "branch") {
    const mine = new Set(context.scope.branchIds);
    if (requested.some((id) => !mine.has(id))) {
      throw new ForbiddenError("You can only grant access to branches you are assigned to.");
    }
  }
  const found = await tx
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.schoolId, context.schoolId), inArray(branches.id, requested)));
  if (found.length !== requested.length) {
    throw new ForbiddenError("One or more selected branches are not part of this school.");
  }
}

/**
 * Roles must belong to this school, and every permission they carry must already be held by
 * the actor. This blocks escalation: a branch admin cannot hand out the school admin role.
 * Returns the validated roles.
 */
export async function assertCanGrantRoles(
  tx: Transaction,
  context: TenantContext,
  roleIds: string[],
): Promise<{ id: string; key: string }[]> {
  const requested = [...new Set(roleIds)];
  const found = await tx
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(and(eq(roles.schoolId, context.schoolId), inArray(roles.id, requested)));
  if (found.length !== requested.length) {
    throw new ForbiddenError("One or more selected roles are not available in this school.");
  }
  const perms = await tx
    .selectDistinct({ code: rolePermissions.permissionCode })
    .from(rolePermissions)
    .where(
      and(
        eq(rolePermissions.schoolId, context.schoolId),
        inArray(rolePermissions.roleId, requested),
      ),
    );
  const held = new Set<string>(context.permissions);
  if (perms.some((p) => !held.has(p.code))) {
    throw new ForbiddenError("You cannot assign a role with permissions you do not have yourself.");
  }
  return found;
}

/** Roles whose permissions are all held by the actor — the ones the UI may offer. */
export async function listAssignableRoles(
  tx: Transaction,
  context: TenantContext,
): Promise<{ id: string; key: string; name: string; description: string }[]> {
  const rows = await tx
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      perms: sql<
        string[]
      >`coalesce(array_agg(${rolePermissions.permissionCode}) filter (where ${rolePermissions.permissionCode} is not null), '{}')`,
    })
    .from(roles)
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(roles.schoolId, context.schoolId))
    .groupBy(roles.id)
    .orderBy(roles.name);
  const held = new Set<string>(context.permissions);
  return rows
    .filter((row) => row.perms.every((code) => held.has(code)))
    .map(({ perms: _perms, ...role }) => role);
}

/** Permissions currently held by a membership through its roles. */
export async function membershipPermissions(
  tx: Transaction,
  schoolId: string,
  membershipId: string,
): Promise<PermissionCode[]> {
  const rows = await tx.execute<{ code: PermissionCode }>(sql`
    select distinct rp.permission_code as code
    from membership_roles mr
    join role_permissions rp on rp.role_id = mr.role_id and rp.school_id = mr.school_id
    where mr.school_id = ${schoolId} and mr.membership_id = ${membershipId}
  `);
  return rows.rows.map((row) => row.code);
}

/** An actor cannot manage someone holding permissions the actor lacks. */
export async function assertNotMorePrivileged(
  tx: Transaction,
  context: TenantContext,
  membershipId: string,
): Promise<void> {
  const held = new Set<string>(context.permissions);
  const theirs = await membershipPermissions(tx, context.schoolId, membershipId);
  if (theirs.some((code) => !held.has(code))) {
    throw new ForbiddenError("You cannot manage someone with more access than you.");
  }
}
