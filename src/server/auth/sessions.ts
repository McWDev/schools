import "server-only";

import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

import { AUTH_POLICY } from "./config";
import { generateToken, hashToken } from "./tokens";

export interface SessionUser {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  activeSchoolId: string | null;
}

const seconds = (n: number) => sql`make_interval(secs => ${n})`;

export async function createSession(
  db: Database,
  userId: string,
  meta: { userAgent?: string | null } = {},
): Promise<string> {
  const token = generateToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: sql`now() + ${seconds(AUTH_POLICY.sessionMaxAgeSeconds)}`,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return token;
}

/**
 * Returns the session's user only if the session is unrevoked, within its absolute and idle
 * lifetimes, and the user is still active. Checked against the database on every request, so
 * suspension and revocation take effect immediately.
 */
export async function validateSession(db: Database, token: string): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      isPlatformAdmin: users.isPlatformAdmin,
      activeSchoolId: sessions.activeSchoolId,
      needsTouch: sql<boolean>`${sessions.lastSeenAt} < now() - ${seconds(AUTH_POLICY.sessionTouchIntervalSeconds)}`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.lastSeenAt, sql`now() - ${seconds(AUTH_POLICY.sessionIdleTimeoutSeconds)}`),
        eq(users.status, "active"),
      ),
    )
    .limit(1);
  if (!row) return null;

  const { needsTouch, ...user } = row;
  if (needsTouch) {
    await db
      .update(sessions)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(sessions.id, row.sessionId));
  }
  return user;
}

export async function revokeSessionByToken(db: Database, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
}

/** Revoke every session of a user, optionally keeping one (e.g. the current session). */
export async function revokeUserSessions(
  db: Pick<Database, "update">,
  userId: string,
  options: { exceptSessionId?: string } = {},
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        options.exceptSessionId ? ne(sessions.id, options.exceptSessionId) : undefined,
      ),
    );
}

/**
 * Store the selected school and issue a fresh token, so a token captured before the context
 * change cannot be replayed afterwards. The caller must have validated the membership first.
 */
export async function switchSessionSchool(
  db: Database,
  sessionId: string,
  schoolId: string,
): Promise<string> {
  const token = generateToken();
  await db
    .update(sessions)
    .set({ activeSchoolId: schoolId, tokenHash: hashToken(token), lastSeenAt: sql`now()` })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  return token;
}
