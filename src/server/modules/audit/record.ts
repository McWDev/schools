import "server-only";

import type { Transaction } from "@/server/db/client";
import { auditEvents } from "@/server/db/schema";
import type { TenantContext } from "@/server/tenancy/context";

export interface AuditInput {
  action: string;
  targetType?: string;
  targetId?: string;
  branchId?: string;
  outcome?: "success" | "denied" | "failure";
  /** Safe, non-sensitive details only. Never include passwords, tokens, or personal records. */
  metadata?: Record<string, unknown>;
}

/** Append an audit event inside the caller's transaction, so it commits or rolls back with it. */
export async function recordAudit(
  tx: Transaction,
  context: TenantContext,
  input: AuditInput,
): Promise<void> {
  await tx.insert(auditEvents).values({
    schoolId: context.schoolId,
    branchId: input.branchId,
    actorUserId: context.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: input.outcome ?? "success",
    metadata: input.metadata ?? {},
  });
}
