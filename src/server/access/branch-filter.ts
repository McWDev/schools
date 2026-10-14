import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { branches } from "@/server/db/schema";

import { canAccessBranch, hasPermission, withAccess, type AccessContext } from "./context";

export interface BranchOption {
  id: string;
  name: string;
  code: string;
  area: string | null;
}

const columns = { id: branches.id, name: branches.name, code: branches.code, area: branches.area };

/** Active branches the user may work in: every branch, or only assigned branches. */
export async function listSelectableBranches(
  db: Database,
  context: AccessContext,
): Promise<BranchOption[]> {
  if (!hasPermission(context, "branches.read")) return [];
  if (context.scope.kind === "branch" && context.scope.branchIds.length === 0) return [];
  return withAccess(db, context, (tx) =>
    tx
      .select(columns)
      .from(branches)
      .where(
        and(
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
 * Validate a requested branch filter. Returns the branch only if it is active and inside the
 * user's scope; anything else (an unassigned branch, a malformed ID) yields null, which callers
 * must treat as "no such branch".
 */
export async function resolveBranchFilter(
  db: Database,
  context: AccessContext,
  branchId: string | null | undefined,
): Promise<BranchOption | null> {
  if (!branchId || !/^[0-9a-f-]{36}$/i.test(branchId) || !canAccessBranch(context, branchId)) {
    return null;
  }
  if (!hasPermission(context, "branches.read")) return null;
  const [row] = await withAccess(db, context, (tx) =>
    tx
      .select(columns)
      .from(branches)
      .where(and(eq(branches.id, branchId), eq(branches.status, "active")))
      .limit(1),
  );
  return row ?? null;
}
