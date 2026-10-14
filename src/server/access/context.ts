import "server-only";

import { sql } from "drizzle-orm";

import type { Database, Transaction } from "@/server/db/client";
import { rolePermissions, userBranches, userRoles, users } from "@/server/db/schema";

import { AccessDeniedError, ForbiddenError } from "./errors";
import type { PermissionCode } from "./permissions";

export type AccessScope =
  { readonly kind: "school" } | { readonly kind: "branch"; readonly branchIds: readonly string[] };

/** What the signed-in user may do, resolved on the server for every request. */
export interface AccessContext {
  readonly userId: string;
  readonly scope: AccessScope;
  /** Union of permissions from the user's roles. */
  readonly permissions: readonly PermissionCode[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only contexts produced by resolveAccessContext() are accepted. An object literal with the same
// shape — e.g. built from request input — is rejected, so access cannot be forged.
const issued = new WeakSet<AccessContext>();

function issue(context: AccessContext): AccessContext {
  const frozen = Object.freeze({
    ...context,
    scope:
      context.scope.kind === "branch"
        ? Object.freeze({
            kind: "branch" as const,
            branchIds: Object.freeze([...context.scope.branchIds]),
          })
        : Object.freeze({ kind: "school" as const }),
    permissions: Object.freeze([...context.permissions]),
  });
  issued.add(frozen);
  return frozen;
}

export function assertAccessContext(context: unknown): asserts context is AccessContext {
  if (typeof context !== "object" || context === null || !issued.has(context as AccessContext)) {
    throw new AccessDeniedError("Missing or invalid access context");
  }
}

async function applySessionSettings(
  tx: Transaction,
  settings: { userId: string; scope?: string; branchIds?: readonly string[] },
): Promise<void> {
  const branchIds = settings.branchIds ?? [];
  for (const id of [settings.userId, ...branchIds]) {
    if (!UUID.test(id)) throw new AccessDeniedError();
  }
  // is_local = true: values are discarded at COMMIT/ROLLBACK and never reach the next pool user.
  await tx.execute(sql`
    select
      set_config('app.user_id', ${settings.userId}, true),
      set_config('app.scope', ${settings.scope ?? ""}, true),
      set_config('app.branch_ids', ${`{${branchIds.join(",")}}`}, true)
  `);
}

/**
 * Resolve a user's access entirely on the server, in one round trip. Fails closed unless the
 * account is active. Never pass a user ID from the browser — only from a validated session.
 */
export async function resolveAccessContext(db: Database, userId: string): Promise<AccessContext> {
  if (!UUID.test(userId)) throw new AccessDeniedError();

  return db.transaction(async (tx) => {
    await applySessionSettings(tx, { userId });
    const result = await tx.execute<{
      scope: "school" | "branch";
      permissions: string[];
      branch_ids: string[];
    }>(sql`
      select u.access_scope as scope,
        coalesce((
          select array_agg(distinct rp.permission_code order by rp.permission_code)
          from ${userRoles} ur
          join ${rolePermissions} rp on rp.role_id = ur.role_id
          where ur.user_id = u.id
        ), '{}') as permissions,
        coalesce((
          select array_agg(ub.branch_id order by ub.branch_id)
          from ${userBranches} ub
          where ub.user_id = u.id
        ), '{}') as branch_ids
      from ${users} u
      where u.id = ${userId} and u.status = 'active'
      limit 1
    `);
    const row = result.rows[0];
    if (!row) throw new AccessDeniedError();

    return issue({
      userId,
      scope:
        row.scope === "school" ? { kind: "school" } : { kind: "branch", branchIds: row.branch_ids },
      permissions: row.permissions as PermissionCode[],
    });
  });
}

/**
 * Run work in a transaction with the database access context set. Application queries must still
 * filter by branch explicitly; row-level security is the backstop.
 */
export async function withAccess<T>(
  db: Database,
  context: AccessContext,
  work: (tx: Transaction, context: AccessContext) => Promise<T>,
): Promise<T> {
  assertAccessContext(context);
  return db.transaction(async (tx) => {
    await applySessionSettings(tx, {
      userId: context.userId,
      scope: context.scope.kind,
      branchIds: context.scope.kind === "branch" ? context.scope.branchIds : [],
    });
    return work(tx, context);
  });
}

/** Whether the context may work with a specific branch. */
export function canAccessBranch(context: AccessContext, branchId: string): boolean {
  return context.scope.kind === "school" || context.scope.branchIds.includes(branchId);
}

export function hasPermission(context: AccessContext, permission: PermissionCode): boolean {
  return context.permissions.includes(permission);
}

/** Throws ForbiddenError unless the context holds the permission. */
export function requirePermission(context: AccessContext, permission: PermissionCode): void {
  assertAccessContext(context);
  if (!hasPermission(context, permission)) throw new ForbiddenError();
}
