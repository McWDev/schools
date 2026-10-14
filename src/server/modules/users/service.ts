import "server-only";

import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { requirePermission, withAccess, type AccessContext } from "@/server/access/context";
import { ConflictError, ForbiddenError } from "@/server/access/errors";
import { normalizeEmail } from "@/server/auth/login";
import { revokeUserSessions } from "@/server/auth/sessions";
import { generateToken, hashToken } from "@/server/auth/tokens";
import type { Database, Transaction } from "@/server/db/client";
import {
  branches,
  roles,
  schoolSettings,
  userBranches,
  userInvitations,
  userRoles,
  users,
} from "@/server/db/schema";
import type { Mailer } from "@/server/email/mailer";
import { recordAudit } from "@/server/modules/audit/record";

import {
  assertCanGrantAccess,
  assertCanGrantRoles,
  assertNotMorePrivileged,
  listAssignableRoles,
  visibleUsersFilter,
  type AccessGrant,
} from "./access-rules";

export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface StaffMember {
  userId: string;
  email: string;
  displayName: string;
  status: "invited" | "active" | "suspended" | "deactivated";
  scope: "school" | "branch";
  branches: { id: string; name: string; code: string }[];
  roles: { id: string; key: string; name: string }[];
  hasAvatar: boolean;
  isSelf: boolean;
}

const uuid = z.uuid();

const accessInput = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("school") }).strict(),
  z
    .object({
      scope: z.literal("branch"),
      branchIds: z.array(uuid).min(1, "Choose at least one branch.").max(50),
    })
    .strict(),
]);

const roleIdsInput = z.array(uuid).min(1, "Choose at least one role.").max(10);

// .strict() everywhere: unknown keys such as "permissions", "status", or "accessScope" are
// rejected instead of silently ignored, so forged payloads fail loudly.
export const inviteInput = z
  .object({
    email: z.email("Enter a valid email address.").max(254),
    displayName: z.string().trim().min(2, "Enter the person's name.").max(120),
    access: accessInput,
    roleIds: roleIdsInput,
  })
  .strict();

export const profileInput = z
  .object({ displayName: z.string().trim().min(2, "Enter a name.").max(120) })
  .strict();

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function loadStaff(
  tx: Transaction,
  context: AccessContext,
  where: SQL | undefined,
  page: { limit: number; offset: number },
): Promise<StaffMember[]> {
  const rows = await tx
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      status: users.status,
      scope: users.accessScope,
      hasAvatar: sql<boolean>`${users.avatarKey} is not null`,
    })
    .from(users)
    .where(where)
    .orderBy(asc(users.displayName), asc(users.id))
    .limit(page.limit)
    .offset(page.offset);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.userId);
  const [branchRows, roleRows] = await Promise.all([
    tx
      .select({
        userId: userBranches.userId,
        id: branches.id,
        name: branches.name,
        code: branches.code,
      })
      .from(userBranches)
      .innerJoin(branches, eq(branches.id, userBranches.branchId))
      .where(inArray(userBranches.userId, ids))
      .orderBy(asc(branches.name)),
    tx
      .select({ userId: userRoles.userId, id: roles.id, key: roles.key, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, ids))
      .orderBy(asc(roles.name)),
  ]);

  return rows.map((row) => ({
    ...row,
    isSelf: row.userId === context.userId,
    branches: branchRows.filter((b) => b.userId === row.userId).map(({ userId: _u, ...b }) => b),
    roles: roleRows.filter((r) => r.userId === row.userId).map(({ userId: _u, ...r }) => r),
  }));
}

export async function listStaff(
  db: Database,
  context: AccessContext,
  query: { search?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: StaffMember[]; total: number; page: number; pageSize: number }> {
  requirePermission(context, "users.read");
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const search = query.search?.trim().slice(0, 100);
  const where = and(
    visibleUsersFilter(context),
    search
      ? or(
          ilike(users.displayName, `%${escapeLike(search)}%`),
          ilike(users.email, `%${escapeLike(search)}%`),
        )
      : undefined,
  );

  return withAccess(db, context, async (tx) => {
    const [{ total }] = await tx.select({ total: count() }).from(users).where(where);
    const items = await loadStaff(tx, context, where, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  });
}

async function findVisibleStaff(
  tx: Transaction,
  context: AccessContext,
  userId: string,
): Promise<StaffMember | null> {
  if (!uuid.safeParse(userId).success) return null;
  const [member] = await loadStaff(
    tx,
    context,
    and(visibleUsersFilter(context), eq(users.id, userId)),
    {
      limit: 1,
      offset: 0,
    },
  );
  return member ?? null;
}

/** Returns null for people outside the caller's branch scope — the same as "not found". */
export async function getStaff(
  db: Database,
  context: AccessContext,
  userId: string,
): Promise<StaffMember | null> {
  requirePermission(context, "users.read");
  return withAccess(db, context, (tx) => findVisibleStaff(tx, context, userId));
}

export async function getInviteOptions(
  db: Database,
  context: AccessContext,
): Promise<{
  roles: Awaited<ReturnType<typeof listAssignableRoles>>;
  branches: { id: string; name: string; code: string }[];
  canGrantSchoolScope: boolean;
}> {
  requirePermission(context, "users.read");
  return withAccess(db, context, async (tx) => {
    const visibleBranches = await tx
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.status, "active"),
          context.scope.kind === "school"
            ? undefined
            : context.scope.branchIds.length
              ? inArray(branches.id, [...context.scope.branchIds])
              : sql`false`,
        ),
      )
      .orderBy(asc(branches.name));
    return {
      roles: await listAssignableRoles(tx, context),
      branches: visibleBranches,
      canGrantSchoolScope: context.scope.kind === "school",
    };
  });
}

/** Load someone the actor may change, enforcing scope, self-protection, and privilege. */
async function manageableStaff(
  tx: Transaction,
  context: AccessContext,
  userId: string,
  options: { allowSelf?: boolean } = {},
): Promise<StaffMember | null> {
  const member = await findVisibleStaff(tx, context, userId);
  if (!member) return null;
  if (member.isSelf && !options.allowSelf) {
    throw new ForbiddenError("You cannot change your own access. Ask another administrator.");
  }
  if (!member.isSelf) await assertNotMorePrivileged(tx, context, member.userId);
  return member;
}

async function replaceAccess(tx: Transaction, userId: string, access: AccessGrant) {
  await tx.update(users).set({ accessScope: access.scope }).where(eq(users.id, userId));
  await tx.delete(userBranches).where(eq(userBranches.userId, userId));
  if (access.scope === "branch") {
    await tx
      .insert(userBranches)
      .values([...new Set(access.branchIds)].map((branchId) => ({ userId, branchId })));
  }
}

async function replaceRoles(tx: Transaction, userId: string, roleIds: string[]) {
  await tx.delete(userRoles).where(eq(userRoles.userId, userId));
  await tx.insert(userRoles).values([...new Set(roleIds)].map((roleId) => ({ userId, roleId })));
}

async function issueInvitation(
  tx: Transaction,
  context: AccessContext,
  userId: string,
): Promise<string> {
  const token = generateToken();
  await tx
    .update(userInvitations)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(userInvitations.userId, userId),
        isNull(userInvitations.acceptedAt),
        isNull(userInvitations.revokedAt),
      ),
    );
  await tx.insert(userInvitations).values({
    userId,
    invitedByUserId: context.userId,
    tokenHash: hashToken(token),
    expiresAt: sql`now() + make_interval(secs => ${INVITATION_TTL_SECONDS})`,
  });
  return token;
}

async function schoolName(tx: Transaction): Promise<string> {
  const [row] = await tx.select({ name: schoolSettings.name }).from(schoolSettings).limit(1);
  return row?.name ?? "your school";
}

function invitationEmail(input: { to: string; name: string; school: string; link: string }) {
  return {
    to: input.to,
    subject: `You're invited to ${input.school}`,
    text: [
      `Hello ${input.name},`,
      "",
      `You have been invited to ${input.school}'s school management system.`,
      "Use this link to set your password and activate your account:",
      input.link,
      "",
      "The link expires in 7 days and can be used once.",
    ].join("\n"),
  };
}

/**
 * Create a staff account with its roles and branch access, and email a single-use setup link.
 * The email is sent after commit, so a mail failure never leaves a half-created account.
 */
export async function inviteStaff(
  db: Database,
  context: AccessContext,
  mailer: Mailer,
  input: unknown,
  appUrl: string,
): Promise<{ userId: string }> {
  requirePermission(context, "users.invite");
  const data = inviteInput.parse(input);
  const email = normalizeEmail(data.email);

  const result = await withAccess(db, context, async (tx) => {
    await assertCanGrantAccess(tx, context, data.access);
    const grantedRoles = await assertCanGrantRoles(tx, context, data.roleIds);

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) throw new ConflictError("An account with this email address already exists.");

    const [user] = await tx
      .insert(users)
      .values({
        email,
        displayName: data.displayName,
        status: "invited",
        accessScope: data.access.scope,
      })
      .returning({ id: users.id });
    await replaceAccess(tx, user.id, data.access);
    await replaceRoles(tx, user.id, data.roleIds);
    const token = await issueInvitation(tx, context, user.id);

    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "user.invite",
      targetType: "user",
      targetId: user.id,
      metadata: {
        roles: grantedRoles.map((r) => r.key).sort(),
        scope: data.access.scope,
        branchCount: data.access.scope === "branch" ? data.access.branchIds.length : 0,
      },
    });
    return { userId: user.id, token, school: await schoolName(tx) };
  });

  await mailer.send(
    invitationEmail({
      to: email,
      name: data.displayName,
      school: result.school,
      link: `${appUrl}/accept-invitation#token=${result.token}`,
    }),
  );
  return { userId: result.userId };
}

export async function resendInvitation(
  db: Database,
  context: AccessContext,
  mailer: Mailer,
  userId: string,
  appUrl: string,
): Promise<boolean> {
  requirePermission(context, "users.invite");
  const result = await withAccess(db, context, async (tx) => {
    const member = await manageableStaff(tx, context, userId);
    if (!member || member.status !== "invited") return null;
    const token = await issueInvitation(tx, context, member.userId);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "user.invite.resend",
      targetType: "user",
      targetId: member.userId,
    });
    return { member, token, school: await schoolName(tx) };
  });
  if (!result) return false;
  await mailer.send(
    invitationEmail({
      to: result.member.email,
      name: result.member.displayName,
      school: result.school,
      link: `${appUrl}/accept-invitation#token=${result.token}`,
    }),
  );
  return true;
}

export async function setStaffRoles(
  db: Database,
  context: AccessContext,
  userId: string,
  input: unknown,
): Promise<StaffMember | null> {
  requirePermission(context, "users.assign_roles");
  const roleIds = roleIdsInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const member = await manageableStaff(tx, context, userId);
    if (!member) return null;
    const granted = await assertCanGrantRoles(tx, context, roleIds);
    await replaceRoles(tx, member.userId, roleIds);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "user.roles.update",
      targetType: "user",
      targetId: member.userId,
      metadata: {
        before: member.roles.map((r) => r.key).sort(),
        after: granted.map((r) => r.key).sort(),
      },
    });
    return findVisibleStaff(tx, context, member.userId);
  });
}

export async function setStaffAccess(
  db: Database,
  context: AccessContext,
  userId: string,
  input: unknown,
): Promise<StaffMember | null> {
  requirePermission(context, "users.assign_roles");
  const access = accessInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const member = await manageableStaff(tx, context, userId);
    if (!member) return null;
    await assertCanGrantAccess(tx, context, access);
    await replaceAccess(tx, member.userId, access);
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "user.access.update",
      targetType: "user",
      targetId: member.userId,
      metadata: {
        before: { scope: member.scope, branchIds: member.branches.map((b) => b.id) },
        after: {
          scope: access.scope,
          branchIds: access.scope === "branch" ? access.branchIds : [],
        },
      },
    });
    // A branch admin who just moved someone outside their own branches can no longer see them.
    return findVisibleStaff(tx, context, member.userId);
  });
}

/**
 * Remove or restore someone's access. Removing deactivates the account and revokes every
 * session immediately; history (audit, records they created) is kept.
 */
export async function setStaffStatus(
  db: Database,
  context: AccessContext,
  userId: string,
  status: "active" | "deactivated",
): Promise<StaffMember | null> {
  requirePermission(context, "users.deactivate");
  if (status !== "active" && status !== "deactivated") throw new ForbiddenError();
  return withAccess(db, context, async (tx) => {
    const member = await manageableStaff(tx, context, userId);
    if (!member) return null;

    if (status === "deactivated") {
      await tx.update(users).set({ status: "deactivated" }).where(eq(users.id, member.userId));
      await revokeUserSessions(tx, member.userId);
    } else {
      // Someone who never set a password goes back to "invited" rather than "active".
      await tx
        .update(users)
        .set({
          status: sql`case when ${users.passwordHash} is null then 'invited'::user_status else 'active'::user_status end`,
        })
        .where(eq(users.id, member.userId));
    }

    await recordAudit(tx, {
      actorUserId: context.userId,
      action: status === "deactivated" ? "user.deactivate" : "user.reactivate",
      targetType: "user",
      targetId: member.userId,
    });
    return findVisibleStaff(tx, context, member.userId);
  });
}

export async function updateStaffProfile(
  db: Database,
  context: AccessContext,
  userId: string,
  input: unknown,
): Promise<StaffMember | null> {
  requirePermission(context, "users.update");
  const data = profileInput.parse(input);
  return withAccess(db, context, async (tx) => {
    const member = await manageableStaff(tx, context, userId, { allowSelf: true });
    if (!member) return null;
    await tx
      .update(users)
      .set({ displayName: data.displayName })
      .where(eq(users.id, member.userId));
    await recordAudit(tx, {
      actorUserId: context.userId,
      action: "user.profile.update",
      targetType: "user",
      targetId: member.userId,
      metadata: { fields: ["displayName"] },
    });
    return findVisibleStaff(tx, context, member.userId);
  });
}

/**
 * Storage key of a profile photo the caller may view: someone inside the caller's scope, with
 * users.read. Returns null otherwise.
 */
export async function getVisibleAvatarKey(
  db: Database,
  context: AccessContext,
  userId: string,
): Promise<string | null> {
  if (!uuid.safeParse(userId).success || !context.permissions.includes("users.read")) return null;
  return withAccess(db, context, async (tx) => {
    const [row] = await tx
      .select({ key: users.avatarKey })
      .from(users)
      .where(and(visibleUsersFilter(context), eq(users.id, userId)))
      .limit(1);
    return row?.key ?? null;
  });
}
