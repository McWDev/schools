import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { passwordResetTokens, users } from "@/server/db/schema";
import type { Mailer } from "@/server/email/mailer";
import { recordPlatformAudit } from "@/server/modules/audit/record";

import { AUTH_POLICY } from "./config";
import { AuthValidationError } from "./errors";
import { normalizeEmail } from "./login";
import { hashPassword, passwordSchema } from "./password";
import { consumeRateLimit } from "./rate-limit";
import { revokeUserSessions } from "./sessions";
import { generateToken, hashToken } from "./tokens";

/** Issue a single-use setup/reset token for a user. Any earlier unused token is invalidated. */
export async function issuePasswordResetToken(
  db: Pick<Database, "update" | "insert">,
  userId: string,
  ttlSeconds: number = AUTH_POLICY.passwordResetTokenTtlSeconds,
): Promise<string> {
  const token = generateToken();
  await db
    .update(passwordResetTokens)
    .set({ usedAt: sql`now()` })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  await db.insert(passwordResetTokens).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: sql`now() + make_interval(secs => ${ttlSeconds})`,
  });
  return token;
}

/**
 * Always completes without revealing whether the email belongs to an account. The token
 * travels in the URL fragment (#token=...), which browsers never send to the server, so it
 * cannot end up in access logs or Referer headers.
 */
export async function requestPasswordReset(
  db: Database,
  mailer: Mailer,
  input: { email: string; ip: string; appUrl: string },
): Promise<void> {
  const email = normalizeEmail(input.email);
  const { resetRequestPerEmail, resetRequestPerIp } = AUTH_POLICY.rateLimits;
  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(db, `reset-request:ip:${input.ip}`, resetRequestPerIp),
    consumeRateLimit(db, `reset-request:email:${email}`, resetRequestPerEmail),
  ]);
  if (!byIp.allowed || !byEmail.allowed) return;

  const [user] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.email, email), eq(users.status, "active")))
    .limit(1);
  if (!user) return;

  const token = await issuePasswordResetToken(db, user.id);
  const minutes = Math.round(AUTH_POLICY.passwordResetTokenTtlSeconds / 60);
  await mailer.send({
    to: email,
    subject: "Reset your password",
    text: [
      `Hello ${user.displayName},`,
      "",
      "We received a request to reset your password. Use this link to choose a new one:",
      `${input.appUrl}/reset-password#token=${token}`,
      "",
      `The link expires in ${minutes} minutes and can be used once.`,
      "If you did not ask for this, you can ignore this email; your password will not change.",
    ].join("\n"),
  });
  await recordPlatformAudit(db, { action: "auth.password_reset.request", actorUserId: user.id });
}

export type ResetResult =
  { ok: true; userId: string } | { ok: false; reason: "invalid_token" | "rate_limited" };

/** Consume a reset token, set the new password, and revoke every existing session. */
export async function resetPassword(
  db: Database,
  input: { token: string; newPassword: string; ip: string },
): Promise<ResetResult> {
  const limit = await consumeRateLimit(
    db,
    `reset-submit:ip:${input.ip}`,
    AUTH_POLICY.rateLimits.resetSubmitPerIp,
  );
  if (!limit.allowed) return { ok: false, reason: "rate_limited" };

  const parsed = passwordSchema.safeParse(input.newPassword);
  if (!parsed.success) throw new AuthValidationError(parsed.error.issues[0].message);
  if (!input.token || input.token.length > 100) return { ok: false, reason: "invalid_token" };

  // Hash before opening the transaction: argon2 is deliberately slow.
  const passwordHash = await hashPassword(parsed.data);

  return db.transaction(async (tx) => {
    // Conditional update makes the token single-use even under concurrent submissions.
    const [consumed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: sql`now()` })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hashToken(input.token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, sql`now()`),
        ),
      )
      .returning({ userId: passwordResetTokens.userId });
    if (!consumed) return { ok: false, reason: "invalid_token" } as const;

    const [user] = await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: sql`now()` })
      .where(and(eq(users.id, consumed.userId), eq(users.status, "active")))
      .returning({ id: users.id });
    if (!user) return { ok: false, reason: "invalid_token" } as const;

    await revokeUserSessions(tx, user.id);
    await recordPlatformAudit(tx, { action: "auth.password_reset.complete", actorUserId: user.id });
    return { ok: true, userId: user.id } as const;
  });
}
