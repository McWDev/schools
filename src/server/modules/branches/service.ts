import "server-only";

import { and, asc, count, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import {
  canAccessBranch,
  hasPermission,
  requirePermission,
  withAccess,
  type AccessContext,
} from "@/server/access/context";
import { ForbiddenError } from "@/server/access/errors";
import type { Database } from "@/server/db/client";
import { branches, userBranches, users } from "@/server/db/schema";
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

export interface BranchSummary extends BranchView {
  /** Staff assigned to this branch specifically (school-wide staff are not counted). */
  assignedStaff: number;
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

/** Empty strings from forms mean "not set". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .optional();

// .strict() rejects unknown keys (e.g. a forged "status" or "id"), so they fail loudly instead
// of being silently accepted.
export const createBranchInput = z
  .object({
    name: z.string().trim().min(2, "Enter the branch name.").max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, "Use 2–20 letters, numbers, or dashes."),
    area: optionalText(120),
    address: optionalText(300),
    phone: optionalText(40),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .refine(
        (value) => value === "" || z.email().safeParse(value).success,
        "Enter a valid email address.",
      )
      .transform((value) => (value === "" ? null : value))
      .optional(),
  })
  .strict();

export const updateBranchInput = createBranchInput.partial().strict();

/** Branches inside the caller's scope: all of them, or only assigned branches. */
function scopeFilter(context: AccessContext): SQL | undefined {
  if (context.scope.kind === "school") return undefined;
  if (context.scope.branchIds.length === 0) return sql`false`;
  return inArray(branches.id, [...context.scope.branchIds]);
}

/** Opening, editing, and closing branches is a school-level action. */
function requireBranchManagement(context: AccessContext): void {
  requirePermission(context, "branches.manage");
  if (context.scope.kind !== "school") throw new ForbiddenError();
}

/** Thrown for a branch code already used by another branch. */
export class DuplicateBranchCodeError extends Error {
  constructor() {
    super("Another branch already uses this code.");
    this.name = "DuplicateBranchCodeError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ((current as { code?: string }).code === "23505") return true;
    current = current.cause;
  }
  return false;
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

/** Branches in scope with their assigned-staff counts, active branches first. */
export async function listBranchSummaries(
  db: Database,
  context: AccessContext,
): Promise<BranchSummary[]> {
  requirePermission(context, "branches.read");
  return withAccess(db, context, (tx) =>
    tx
      .select({ ...columns, assignedStaff: count(userBranches.userId) })
      .from(branches)
      .leftJoin(userBranches, eq(userBranches.branchId, branches.id))
      .where(scopeFilter(context))
      .groupBy(branches.id)
      .orderBy(sql`${branches.status} = 'inactive'`, asc(branches.name))
      .limit(200),
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

/** Staff assigned to a branch. Only visible to people allowed to see staff (users.read). */
export async function listBranchStaff(
  db: Database,
  context: AccessContext,
  branchId: string,
): Promise<{ userId: string; displayName: string; email: string; status: string }[]> {
  if (!hasPermission(context, "users.read") || !canAccessBranch(context, branchId)) return [];
  return withAccess(db, context, (tx) =>
    tx
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        status: users.status,
      })
      .from(userBranches)
      .innerJoin(users, eq(users.id, userBranches.userId))
      .where(eq(userBranches.branchId, branchId))
      .orderBy(asc(users.displayName))
      .limit(200),
  );
}

export async function createBranch(
  db: Database,
  context: AccessContext,
  input: unknown,
): Promise<BranchView> {
  requireBranchManagement(context);
  const data = createBranchInput.parse(input);
  try {
    return await withAccess(db, context, async (tx) => {
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
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateBranchCodeError();
    throw error;
  }
}

export async function updateBranch(
  db: Database,
  context: AccessContext,
  branchId: string,
  input: unknown,
): Promise<BranchView | null> {
  if (!z.uuid().safeParse(branchId).success || !canAccessBranch(context, branchId)) return null;
  requireBranchManagement(context);
  const data = updateBranchInput.parse(input);
  try {
    return await withAccess(db, context, async (tx) => {
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
        metadata: { fields: Object.keys(data).sort() },
      });
      return row;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateBranchCodeError();
    throw error;
  }
}

/**
 * Close or reopen a branch. Nothing is deleted: staff assignments, records, and history stay;
 * an inactive branch simply disappears from selectors and new work.
 */
export async function setBranchStatus(
  db: Database,
  context: AccessContext,
  branchId: string,
  status: "active" | "inactive",
): Promise<BranchView | null> {
  if (!z.uuid().safeParse(branchId).success) return null;
  requireBranchManagement(context);
  if (status !== "active" && status !== "inactive") throw new ForbiddenError();
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .update(branches)
      .set({ status })
      .where(eq(branches.id, branchId))
      .returning(columns);
    if (!row) return null;
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: status === "inactive" ? "branch.deactivate" : "branch.reactivate",
      targetType: "branch",
      targetId: row.id,
      branchId: row.id,
    });
    return row;
  });
}
