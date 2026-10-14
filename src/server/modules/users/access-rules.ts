import "server-only";

import { and, eq, inArray, sql, type SQL } from "drizzle-orm";

import type { AccessContext } from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import type { PermissionCode } from "@/server/access/permissions";
import type { Transaction } from "@/server/db/client";
import { branches, rolePermissions, roles, users } from "@/server/db/schema";

export type AccessGrant = { scope: "school" } | { scope: "branch"; branchIds: string[] };

/**
 * Staff the actor may see and manage. A school-wide actor sees everyone. A branch-scoped actor
 * sees only branch-scoped staff whose branches all lie inside the actor's own branches, so a
 * branch admin can never reach a school-wide admin or someone who also works at another branch.
 */
export function visibleUsersFilter(context: AccessContext): SQL | undefined {
  if (context.scope.kind === "school") return undefined;
  const mine = context.scope.branchIds;
  if (mine.length === 0) return sql`false`;
  const myBranches = sql`array[${sql.join(
    mine.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  return and(
    eq(users.accessScope, "branch"),
    sql`exists (select 1 from user_branches ub where ub.user_id = ${users.id})`,
    sql`not exists (
      select 1 from user_branches ub
      where ub.user_id = ${users.id} and ub.branch_id <> all (${myBranches})
    )`,
  );
}

/** The actor may only hand out branch access they hold themselves. */
export async function assertCanGrantAccess(
  tx: Transaction,
  context: AccessContext,
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
    .where(inArray(branches.id, requested));
  if (found.length !== requested.length) {
    throw new ForbiddenError("One or more selected branches do not exist.");
  }
}

/**
 * Every permission a granted role carries must already be held by the actor. This blocks
 * escalation: a branch admin cannot hand out the school admin role. Returns the validated roles.
 */
export async function assertCanGrantRoles(
  tx: Transaction,
  context: AccessContext,
  roleIds: string[],
): Promise<{ id: string; key: string }[]> {
  const requested = [...new Set(roleIds)];
  const found = await tx
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(inArray(roles.id, requested));
  if (found.length !== requested.length) {
    throw new ForbiddenError("One or more selected roles do not exist.");
  }
  const perms = await tx
    .selectDistinct({ code: rolePermissions.permissionCode })
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, requested));
  const held = new Set<string>(context.permissions);
  if (perms.some((p) => !held.has(p.code))) {
    throw new ForbiddenError("You cannot assign a role with permissions you do not have yourself.");
  }
  return found;
}

/** Roles whose permissions are all held by the actor — the ones the UI may offer. */
export async function listAssignableRoles(
  tx: Transaction,
  context: AccessContext,
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
    .groupBy(roles.id)
    .orderBy(roles.name);
  const held = new Set<string>(context.permissions);
  return rows
    .filter((row) => row.perms.every((code) => held.has(code)))
    .map(({ perms: _perms, ...role }) => role);
}

/** An actor cannot manage someone holding permissions the actor lacks. */
export async function assertNotMorePrivileged(
  tx: Transaction,
  context: AccessContext,
  userId: string,
): Promise<void> {
  const rows = await tx.execute<{ code: PermissionCode }>(sql`
    select distinct rp.permission_code as code
    from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = ${userId}
  `);
  const held = new Set<string>(context.permissions);
  if (rows.rows.some((row) => !held.has(row.code))) {
    throw new ForbiddenError("You cannot manage someone with more access than you.");
  }
}
