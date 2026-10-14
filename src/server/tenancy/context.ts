import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Database, Transaction } from "@/server/db/client";
import { membershipBranches, schoolMemberships, schools, users } from "@/server/db/schema";

import { TenantAccessError } from "./errors";

export type TenantScope =
  { readonly kind: "school" } | { readonly kind: "branch"; readonly branchIds: readonly string[] };

export interface TenantContext {
  readonly schoolId: string;
  readonly userId: string;
  readonly membershipId: string;
  readonly scope: TenantScope;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only contexts produced by resolveTenantContext() are accepted. An object literal with the same
// shape — e.g. built from request input — is rejected, so tenant scope cannot be forged.
const issued = new WeakSet<TenantContext>();

function issue(context: TenantContext): TenantContext {
  const frozen = Object.freeze({
    ...context,
    scope:
      context.scope.kind === "branch"
        ? Object.freeze({
            kind: "branch" as const,
            branchIds: Object.freeze([...context.scope.branchIds]),
          })
        : Object.freeze({ kind: "school" as const }),
  });
  issued.add(frozen);
  return frozen;
}

export function assertTenantContext(context: unknown): asserts context is TenantContext {
  if (typeof context !== "object" || context === null || !issued.has(context as TenantContext)) {
    throw new TenantAccessError("Missing or invalid tenant context");
  }
}

async function applySessionSettings(
  tx: Transaction,
  settings: { schoolId?: string; userId: string; scope?: string; branchIds?: readonly string[] },
): Promise<void> {
  const branchIds = settings.branchIds ?? [];
  for (const id of [settings.schoolId, settings.userId, ...branchIds]) {
    if (id !== undefined && !UUID.test(id)) throw new TenantAccessError();
  }
  // is_local = true: values are discarded at COMMIT/ROLLBACK and never reach the next pool user.
  await tx.execute(sql`
    select
      set_config('app.school_id', ${settings.schoolId ?? ""}, true),
      set_config('app.user_id', ${settings.userId}, true),
      set_config('app.scope', ${settings.scope ?? ""}, true),
      set_config('app.branch_ids', ${`{${branchIds.join(",")}}`}, true)
  `);
}

/**
 * Resolve a user's access to a school entirely on the server. Fails closed unless the user, the
 * membership, and the school are all active. Never pass IDs from the browser without this check.
 */
export async function resolveTenantContext(
  db: Database,
  input: { userId: string; schoolId: string },
): Promise<TenantContext> {
  if (!UUID.test(input.userId) || !UUID.test(input.schoolId)) throw new TenantAccessError();

  return db.transaction(async (tx) => {
    await applySessionSettings(tx, { userId: input.userId, schoolId: input.schoolId });

    const [membership] = await tx
      .select({ id: schoolMemberships.id, scope: schoolMemberships.scope })
      .from(schoolMemberships)
      .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(
        and(
          eq(schoolMemberships.userId, input.userId),
          eq(schoolMemberships.schoolId, input.schoolId),
          eq(schoolMemberships.status, "active"),
          eq(schools.status, "active"),
          eq(users.status, "active"),
        ),
      )
      .limit(1);

    if (!membership) throw new TenantAccessError();

    if (membership.scope === "school") {
      return issue({
        schoolId: input.schoolId,
        userId: input.userId,
        membershipId: membership.id,
        scope: { kind: "school" },
      });
    }

    const assigned = await tx
      .select({ branchId: membershipBranches.branchId })
      .from(membershipBranches)
      .where(
        and(
          eq(membershipBranches.membershipId, membership.id),
          eq(membershipBranches.schoolId, input.schoolId),
        ),
      );

    return issue({
      schoolId: input.schoolId,
      userId: input.userId,
      membershipId: membership.id,
      scope: { kind: "branch", branchIds: assigned.map((row) => row.branchId) },
    });
  });
}

/**
 * Run tenant-scoped work in a transaction with the database tenant context set. Application
 * queries must still filter by school/branch explicitly; row-level security is the backstop.
 */
export async function withTenant<T>(
  db: Database,
  context: TenantContext,
  work: (tx: Transaction, context: TenantContext) => Promise<T>,
): Promise<T> {
  assertTenantContext(context);
  return db.transaction(async (tx) => {
    await applySessionSettings(tx, {
      schoolId: context.schoolId,
      userId: context.userId,
      scope: context.scope.kind,
      branchIds: context.scope.kind === "branch" ? context.scope.branchIds : [],
    });
    return work(tx, context);
  });
}

/** Whether the context may access a specific branch of its school. */
export function canAccessBranch(context: TenantContext, branchId: string): boolean {
  return context.scope.kind === "school" || context.scope.branchIds.includes(branchId);
}
