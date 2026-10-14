import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { branches } from "@/server/db/schema";

import { canAccessBranch, hasPermission, withTenant, type TenantContext } from "./context";

export interface BranchOption {
  id: string;
  name: string;
  code: string;
}

/** Active branches the context may work in: all of the school, or only assigned branches. */
export async function listSelectableBranches(
  db: Database,
  context: TenantContext,
): Promise<BranchOption[]> {
  if (!hasPermission(context, "branches.read")) return [];
  if (context.scope.kind === "branch" && context.scope.branchIds.length === 0) return [];
  return withTenant(db, context, (tx) =>
    tx
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.schoolId, context.schoolId),
          eq(branches.status, "active"),
          context.scope.kind === "branch"
            ? inArray(branches.id, [...context.scope.branchIds])
            : undefined,
        ),
      )
      .orderBy(asc(branches.name))
      .limit(200),
  );
}

/**
 * Validate a requested branch filter. Returns the branch only if it is active, in the context
 * school, and inside the user scope; anything else (another school, an unassigned branch, a
 * malformed ID) yields null, which callers must treat as "no such branch".
 */
export async function resolveBranchFilter(
  db: Database,
  context: TenantContext,
  branchId: string | null | undefined,
): Promise<BranchOption | null> {
  if (!branchId || !/^[0-9a-f-]{36}$/i.test(branchId) || !canAccessBranch(context, branchId))
    return null;
  if (!hasPermission(context, "branches.read")) return null;
  const [row] = await withTenant(db, context, (tx) =>
    tx
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.schoolId, context.schoolId),
          eq(branches.id, branchId),
          eq(branches.status, "active"),
        ),
      )
      .limit(1),
  );
  return row ?? null;
}

/** SQL fragment restricting a branch_id column to the filter, or to the context scope. */
export function branchCondition(
  context: TenantContext,
  column: Parameters<typeof eq>[0],
  filter: BranchOption | null,
) {
  if (filter) return eq(column, filter.id);
  if (context.scope.kind === "school") return undefined;
  return context.scope.branchIds.length
    ? inArray(column, [...context.scope.branchIds])
    : sql`false`;
}
