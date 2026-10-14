import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { recordPlatformAudit } from "@/server/modules/audit/record";

import { AUTH_POLICY } from "./config";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { clearRateLimit, consumeRateLimit } from "./rate-limit";
import { createSession } from "./sessions";

export type LoginResult =
  | { ok: true; token: string; userId: string }
  | { ok: false; reason: "invalid_credentials" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number };

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const emailSchema = z.email().max(254);

export async function login(
  db: Database,
  input: { email: string; password: string; ip: string; userAgent?: string | null },
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const { loginPerEmail, loginPerIp } = AUTH_POLICY.rateLimits;

  const [byIp, byEmail] = await Promise.all([
    consumeRateLimit(db, `login:ip:${input.ip}`, loginPerIp),
    consumeRateLimit(db, `login:email:${email}`, loginPerEmail),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    await recordPlatformAudit(db, {
      action: "auth.login",
      outcome: "denied",
      metadata: { reason: "rate_limited" },
    });
    const waits = [byIp, byEmail].filter((r) => !r.allowed).map((r) => r.retryAfterSeconds);
    return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.max(...waits) };
  }

  const [user] = emailSchema.safeParse(email).success
    ? await db
        .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
    : [];

  const passwordOk = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : await verifyAgainstDummy(input.password);

  // One generic outcome for unknown email, wrong password, and inactive account.
  if (!user || !passwordOk || user.status !== "active") {
    const reason = !user
      ? "unknown_account"
      : !passwordOk
        ? "bad_password"
        : `status_${user.status}`;
    await recordPlatformAudit(db, {
      action: "auth.login",
      outcome: "failure",
      actorUserId: user?.id ?? null,
      metadata: { reason },
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  await clearRateLimit(db, `login:email:${email}`);
  const token = await createSession(db, user.id, { userAgent: input.userAgent });
  await recordPlatformAudit(db, { action: "auth.login", outcome: "success", actorUserId: user.id });
  return { ok: true, token, userId: user.id };
}
