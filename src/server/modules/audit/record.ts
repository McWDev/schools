import "server-only";

import type { Transaction } from "@/server/db/client";
import { auditEvents } from "@/server/db/schema";

export interface AuditInput {
  /** The signed-in user who acted, or null for anonymous events such as a failed sign-in. */
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  branchId?: string;
  outcome?: "success" | "denied" | "failure";
  /** Safe, non-sensitive details only. Never include passwords, tokens, or personal records. */
  metadata?: Record<string, unknown>;
}

/**
 * Append an audit event. Pass the caller's transaction so the event commits or rolls back with
 * the change it describes.
 */
export async function recordAudit(
  executor: Pick<Transaction, "insert">,
  input: AuditInput,
): Promise<void> {
  await executor.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    branchId: input.branchId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    outcome: input.outcome ?? "success",
    metadata: input.metadata ?? {},
  });
}
