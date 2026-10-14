import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { recordPlatformAudit } from "@/server/modules/audit/record";

import { AUTH_POLICY } from "./config";
import { AuthValidationError } from "./errors";
import { hashPassword, passwordSchema } from "./password";
import { consumeRateLimit } from "./rate-limit";
import { hashToken } from "./tokens";

export type AcceptInvitationResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "invalid_token" | "already_active" | "rate_limited" };

/**
 * Activate an invited account with its first password. The token is consumed atomically by a
 * database function (single use, unexpired, not revoked), so a replayed link always fails.
 */
export async function acceptInvitation(
  db: Database,
  input: { token: string; password: string; ip: string },
): Promise<AcceptInvitationResult> {
  const limit = await consumeRateLimit(
    db,
    `invite-accept:ip:${input.ip}`,
    AUTH_POLICY.rateLimits.resetSubmitPerIp,
  );
  if (!limit.allowed) return { ok: false, reason: "rate_limited" };

  const parsed = passwordSchema.safeParse(input.password);
  if (!parsed.success) throw new AuthValidationError(parsed.error.issues[0].message);
  if (!input.token || input.token.length > 100) return { ok: false, reason: "invalid_token" };
  const passwordHash = await hashPassword(parsed.data);

  return db.transaction(async (tx) => {
    const consumed = await tx.execute<{ user_id: string; school_id: string }>(
      sql`select user_id, school_id from app.consume_invitation(${hashToken(input.token)})`,
    );
    const invitation = consumed.rows[0];
    if (!invitation) return { ok: false, reason: "invalid_token" } as const;

    const [activated] = await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: sql`now()`, status: "active" })
      .where(and(eq(users.id, invitation.user_id), eq(users.status, "invited")))
      .returning({ id: users.id });
    if (!activated) {
      // Already set up through another invitation, or the account was deactivated meanwhile.
      // Do not overwrite an existing password from an invitation link.
      return { ok: false, reason: "already_active" } as const;
    }

    await recordPlatformAudit(tx, {
      action: "user.invite.accept",
      actorUserId: activated.id,
      targetType: "school",
      targetId: invitation.school_id,
    });
    return { ok: true, userId: activated.id } as const;
  });
}
