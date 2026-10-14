import "server-only";

import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

import { verifyPassword } from "./password";
import { consumeRateLimit } from "./rate-limit";

/** High-risk actions need a password entered within this window. */
export const REAUTH_WINDOW_SECONDS = 10 * 60;

/** True if the session signed in or re-confirmed its password within the window. */
export async function hasRecentAuthentication(db: Database, sessionId: string): Promise<boolean> {
  const window = sql`now() - make_interval(secs => ${REAUTH_WINDOW_SECONDS})`;
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        or(gt(sessions.createdAt, window), gt(sessions.reauthenticatedAt, window)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Verify the signed-in user's password and mark the session as recently authenticated. */
export async function confirmPassword(
  db: Database,
  session: { sessionId: string; userId: string },
  password: string,
): Promise<boolean> {
  const limit = await consumeRateLimit(db, `reauth:user:${session.userId}`, {
    limit: 5,
    windowSeconds: 15 * 60,
  });
  if (!limit.allowed) return false;

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) return false;

  await db
    .update(sessions)
    .set({ reauthenticatedAt: sql`now()` })
    .where(eq(sessions.id, session.sessionId));
  return true;
}
