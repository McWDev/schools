import "server-only";

import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/server/db/client";
import { branches } from "@/server/db/schema";
import { recordAudit } from "@/server/modules/audit/record";
import { canAccessBranch, withTenant, type TenantContext } from "@/server/tenancy/context";
import { ForbiddenError } from "@/server/tenancy/errors";

export interface BranchView {
  id: string;
  name: string;
  code: string;
  status: "active" | "inactive";
  address: string | null;
  phone: string | null;
  email: string | null;
}

const columns = {
  id: branches.id,
  name: branches.name,
  code: branches.code,
  status: branches.status,
  address: branches.address,
  phone: branches.phone,
  email: branches.email,
};

// .strict() rejects unknown keys, so a forged school_id/schoolId in the payload is an error
// rather than being silently accepted. The school always comes from the server-side context.
export const createBranchInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, "Use 2–20 letters, numbers, or dashes"),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
  })
  .strict();

export const updateBranchInput = createBranchInput.partial().strict();

function scopeFilter(context: TenantContext): SQL | undefined {
  const school = eq(branches.schoolId, context.schoolId);
  if (context.scope.kind === "school") return school;
  if (context.scope.branchIds.length === 0) return and(school, sql`false`);
  return and(school, inArray(branches.id, [...context.scope.branchIds]));
}

export async function listBranches(
  db: Database,
  context: TenantContext,
  page: { limit?: number; offset?: number } = {},
): Promise<BranchView[]> {
  const limit = Math.min(Math.max(page.limit ?? 50, 1), 100);
  const offset = Math.max(page.offset ?? 0, 0);
  return withTenant(db, context, (tx) =>
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
  context: TenantContext,
  branchId: string,
): Promise<BranchView | null> {
  if (!z.uuid().safeParse(branchId).success) return null;
  return withTenant(db, context, async (tx) => {
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
  context: TenantContext,
  input: unknown,
): Promise<BranchView> {
  if (context.scope.kind !== "school") throw new ForbiddenError();
  const data = createBranchInput.parse(input);
  return withTenant(db, context, async (tx) => {
    const [row] = await tx
      .insert(branches)
      .values({ ...data, schoolId: context.schoolId })
      .returning(columns);
    await recordAudit(tx, context, {
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
  context: TenantContext,
  branchId: string,
  input: unknown,
): Promise<BranchView | null> {
  if (!z.uuid().safeParse(branchId).success || !canAccessBranch(context, branchId)) return null;
  const data = updateBranchInput.parse(input);
  return withTenant(db, context, async (tx) => {
    const [row] = await tx
      .update(branches)
      .set(data)
      .where(and(scopeFilter(context), eq(branches.id, branchId)))
      .returning(columns);
    if (!row) return null;
    await recordAudit(tx, context, {
      action: "branch.update",
      targetType: "branch",
      targetId: row.id,
      branchId: row.id,
      metadata: { fields: Object.keys(data) },
    });
    return row;
  });
}
