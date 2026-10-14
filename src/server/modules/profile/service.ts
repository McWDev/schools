import "server-only";

import { randomBytes } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { AuthValidationError } from "@/server/auth/errors";
import { hashPassword, passwordSchema, verifyPassword } from "@/server/auth/password";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { revokeUserSessions } from "@/server/auth/sessions";
import type { Database } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { recordAudit } from "@/server/modules/audit/record";
import type { ObjectStorage } from "@/server/storage/object-storage";

import { processAvatar } from "./avatar-image";
import { profileInput } from "../users/service";

/** Self-service: a signed-in user changes their own display name. */
export async function updateOwnDisplayName(
  db: Database,
  userId: string,
  input: unknown,
): Promise<void> {
  const { displayName } = profileInput.parse(input);
  await db.update(users).set({ displayName }).where(eq(users.id, userId));
  await recordAudit(db, {
    action: "profile.update",
    actorUserId: userId,
    metadata: { fields: ["displayName"] },
  });
}

/**
 * Validate, re-encode, and store a new profile photo under a server-generated key. The previous
 * photo is deleted after the database points at the new one.
 */
export async function setOwnAvatar(
  db: Database,
  storage: ObjectStorage,
  userId: string,
  upload: Uint8Array,
): Promise<void> {
  const image = await processAvatar(upload);
  const key = `avatars/${userId}/${randomBytes(12).toString("hex")}.webp`;
  await storage.put(key, image, "image/webp");

  const [previous] = await db
    .select({ key: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId));
  await db.update(users).set({ avatarKey: key }).where(eq(users.id, userId));
  if (previous?.key) await storage.delete(previous.key);
  await recordAudit(db, { action: "profile.avatar.update", actorUserId: userId });
}

export async function removeOwnAvatar(
  db: Database,
  storage: ObjectStorage,
  userId: string,
): Promise<void> {
  const [previous] = await db
    .select({ key: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId));
  if (!previous?.key) return;
  await db.update(users).set({ avatarKey: null }).where(eq(users.id, userId));
  await storage.delete(previous.key);
  await recordAudit(db, { action: "profile.avatar.remove", actorUserId: userId });
}

export type ChangePasswordResult =
  { ok: true } | { ok: false; reason: "wrong_password" | "rate_limited" };

/** Change password with the current one; every other session is signed out. */
export async function changeOwnPassword(
  db: Database,
  session: { userId: string; sessionId: string },
  input: { currentPassword: string; newPassword: string },
): Promise<ChangePasswordResult> {
  const limit = await consumeRateLimit(db, `password-change:user:${session.userId}`, {
    limit: 5,
    windowSeconds: 15 * 60,
  });
  if (!limit.allowed) return { ok: false, reason: "rate_limited" };

  const parsed = passwordSchema.safeParse(input.newPassword);
  if (!parsed.success) throw new AuthValidationError(parsed.error.issues[0].message);

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.userId));
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    return { ok: false, reason: "wrong_password" };
  }

  const passwordHash = await hashPassword(parsed.data);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: sql`now()` })
      .where(eq(users.id, session.userId));
    await revokeUserSessions(tx, session.userId, { exceptSessionId: session.sessionId });
    await recordAudit(tx, {
      action: "profile.password.change",
      actorUserId: session.userId,
    });
  });
  return { ok: true };
}
