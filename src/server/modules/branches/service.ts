import "server-only";

import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  canAccessBranch,
  requirePermission,
  withAccess,
  type AccessContext,
} from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import type { Database } from "@/server/db/client";
import { branches } from "@/server/db/schema";
import { recordAudit } from "@/server/modules/audit/record";

export interface BranchView {
  id: string;
  name: string;
  code: string;
  status: "active" | "inactive";
  area: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

const columns = {
  id: branches.id,
  name: branches.name,
  code: branches.code,
  status: branches.status,
  area: branches.area,
  address: branches.address,
  phone: branches.phone,
  email: branches.email,
};

// .strict() rejects unknown keys (e.g. a forged "status" or "id"), so they fail loudly instead
// of being silently accepted.
export const createBranchInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, "Use 2–20 letters, numbers, or dashes"),
    area: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
  })
  .strict();

export const updateBranchInput = createBranchInput.partial().strict();

/** Branches inside the caller's scope: all of them, or only assigned branches. */
function scopeFilter(context: AccessContext): SQL | undefined {
  if (context.scope.kind === "school") return undefined;
  if (context.scope.branchIds.length === 0) return sql`false`;
  return inArray(branches.id, [...context.scope.branchIds]);
}

export async function listBranches(
  db: Database,
  context: AccessContext,
  page: { limit?: number; offset?: number } = {},
): Promise<BranchView[]> {
  requirePermission(context, "branches.read");
  const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
  const offset = Math.max(page.offset ?? 0, 0);
  return withAccess(db, context, (tx) =>
    tx
      .select(columns)
      .from(branches)
      .where(scopeFilter(context))
      .orderBy(asc(branches.name), asc(branches.id))
      .limit(limit)
      .offset(offset),
  );
}

/** Returns null for branches outside the caller's scope — indistinguishable from "not found". */
export async function getBranch(
  db: Database,
  context: AccessContext,
  branchId: string,
): Promise<BranchView | null> {
  requirePermission(context, "branches.read");
  if (!z.uuid().safeParse(branchId).success) return null;
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .select(columns)
      .from(branches)
      .where(and(scopeFilter(context), eq(branches.id, branchId)))
      .limit(1);
    return row ?? null;
  });
}

export async function createBranch(
  db: Database,
  context: AccessContext,
  input: unknown,
): Promise<BranchView> {
  requirePermission(context, "branches.manage");
  // Opening a branch is a school-level action, even for a branch admin holding the permission.
  if (context.scope.kind !== "school") throw new ForbiddenError();
  const data = createBranchInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx.insert(branches).values(data).returning(columns);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "branch.create",
      targetType: "branch",
      targetId: row.id,
      branchId: row.id,
      metadata: { code: row.code },
    });
    return row;
  });
}

export async function updateBranch(
  db: Database,
  context: AccessContext,
  branchId: string,
  input: unknown,
): Promise<BranchView | null> {
  if (!z.uuid().safeParse(branchId).success || !canAccessBranch(context, branchId)) return null;
  requirePermission(context, "branches.manage");
  const data = updateBranchInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .update(branches)
      .set(data)
      .where(and(scopeFilter(context), eq(branches.id, branchId)))
      .returning(columns);
    if (!row) return null;
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "branch.update",
      targetType: "branch",
      targetId: row.id,
      branchId: row.id,
      metadata: { fields: Object.keys(data) },
    });
    return row;
  });
}
