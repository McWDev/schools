import "server-only";

import { and, asc, count, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { normalizeEmail } from "@/server/auth/login";
import { revokeUserSessions } from "@/server/auth/sessions";
import { generateToken, hashToken } from "@/server/auth/tokens";
import type { Database, Transaction } from "@/server/db/client";
import {
  branches,
  membershipBranches,
  membershipRoles,
  roles,
  schoolMemberships,
  schools,
  sessions,
  userInvitations,
  users,
} from "@/server/db/schema";
import type { Mailer } from "@/server/email/mailer";
import { recordAudit } from "@/server/modules/audit/record";
import { requirePermission, withTenant, type TenantContext } from "@/server/tenancy/context";
import { ConflictError, ForbiddenError } from "@/server/tenancy/errors";

import {
  assertCanGrantAccess,
  assertCanGrantRoles,
  assertNotMorePrivileged,
  listAssignableRoles,
  visibleMembershipsFilter,
  type AccessGrant,
} from "./access-rules";

export const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface MemberView {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  userStatus: "invited" | "active" | "suspended" | "deactivated";
  membershipStatus: "active" | "suspended" | "removed";
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

// .strict() everywhere: unknown keys such as "permissions", "isPlatformAdmin", or "schoolId" are
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

async function loadMembers(
  tx: Transaction,
  context: TenantContext,
  where: ReturnType<typeof and>,
  page: { limit: number; offset: number },
): Promise<MemberView[]> {
  const rows = await tx
    .select({
      membershipId: schoolMemberships.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      userStatus: users.status,
      membershipStatus: schoolMemberships.status,
      scope: schoolMemberships.scope,
      hasAvatar: sql<boolean>`${users.avatarKey} is not null`,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(users.id, schoolMemberships.userId))
    .where(where)
    .orderBy(asc(users.displayName), asc(schoolMemberships.id))
    .limit(page.limit)
    .offset(page.offset);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.membershipId);
  const [branchRows, roleRows] = await Promise.all([
    tx
      .select({
        membershipId: membershipBranches.membershipId,
        id: branches.id,
        name: branches.name,
        code: branches.code,
      })
      .from(membershipBranches)
      .innerJoin(
        branches,
        and(
          eq(branches.id, membershipBranches.branchId),
          eq(branches.schoolId, membershipBranches.schoolId),
        ),
      )
      .where(
        and(
          eq(membershipBranches.schoolId, context.schoolId),
          inArray(membershipBranches.membershipId, ids),
        ),
      )
      .orderBy(asc(branches.name)),
    tx
      .select({
        membershipId: membershipRoles.membershipId,
        id: roles.id,
        key: roles.key,
        name: roles.name,
      })
      .from(membershipRoles)
      .innerJoin(
        roles,
        and(eq(roles.id, membershipRoles.roleId), eq(roles.schoolId, membershipRoles.schoolId)),
      )
      .where(
        and(
          eq(membershipRoles.schoolId, context.schoolId),
          inArray(membershipRoles.membershipId, ids),
        ),
      )
      .orderBy(asc(roles.name)),
  ]);

  return rows.map((row) => ({
    ...row,
    isSelf: row.userId === context.userId,
    branches: branchRows
      .filter((b) => b.membershipId === row.membershipId)
      .map(({ membershipId: _m, ...b }) => b),
    roles: roleRows
      .filter((r) => r.membershipId === row.membershipId)
      .map(({ membershipId: _m, ...r }) => r),
  }));
}

export async function listMembers(
  db: Database,
  context: TenantContext,
  query: { search?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: MemberView[]; total: number; page: number; pageSize: number }> {
  requirePermission(context, "users.read");
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const search = query.search?.trim().slice(0, 100);
  const where = and(
    visibleMembershipsFilter(context),
    ne(schoolMemberships.status, "removed"),
    search
      ? or(
          ilike(users.displayName, `%${escapeLike(search)}%`),
          ilike(users.email, `%${escapeLike(search)}%`),
        )
      : undefined,
  );

  return withTenant(db, context, async (tx) => {
    const [{ total }] = await tx
      .select({ total: count() })
      .from(schoolMemberships)
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(where);
    const items = await loadMembers(tx, context, where, {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items, total, page, pageSize };
  });
}

async function findVisibleMember(
  tx: Transaction,
  context: TenantContext,
  membershipId: string,
): Promise<MemberView | null> {
  if (!uuid.safeParse(membershipId).success) return null;
  const [member] = await loadMembers(
    tx,
    context,
    and(visibleMembershipsFilter(context), eq(schoolMemberships.id, membershipId)),
    { limit: 1, offset: 0 },
  );
  return member ?? null;
}

/** Returns null for memberships outside the caller's school or branch scope. */
export async function getMember(
  db: Database,
  context: TenantContext,
  membershipId: string,
): Promise<MemberView | null> {
  requirePermission(context, "users.read");
  return withTenant(db, context, (tx) => findVisibleMember(tx, context, membershipId));
}

export async function getInviteOptions(
  db: Database,
  context: TenantContext,
): Promise<{
  roles: Awaited<ReturnType<typeof listAssignableRoles>>;
  branches: { id: string; name: string; code: string }[];
  canGrantSchoolScope: boolean;
}> {
  requirePermission(context, "users.read");
  return withTenant(db, context, async (tx) => {
    const visibleBranches = await tx
      .select({ id: branches.id, name: branches.name, code: branches.code })
      .from(branches)
      .where(
        and(
          eq(branches.schoolId, context.schoolId),
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

/** Load a member the actor may change, enforcing scope, self-protection, and privilege. */
async function manageableMember(
  tx: Transaction,
  context: TenantContext,
  membershipId: string,
  options: { allowSelf?: boolean } = {},
): Promise<MemberView | null> {
  const member = await findVisibleMember(tx, context, membershipId);
  if (!member) return null;
  if (member.isSelf && !options.allowSelf) {
    throw new ForbiddenError("You cannot change your own access. Ask another administrator.");
  }
  if (!member.isSelf) await assertNotMorePrivileged(tx, context, member.membershipId);
  return member;
}

async function replaceAccess(
  tx: Transaction,
  context: TenantContext,
  membershipId: string,
  access: AccessGrant,
) {
  await tx
    .update(schoolMemberships)
    .set({ scope: access.scope })
    .where(
      and(eq(schoolMemberships.schoolId, context.schoolId), eq(schoolMemberships.id, membershipId)),
    );
  await tx
    .delete(membershipBranches)
    .where(
      and(
        eq(membershipBranches.schoolId, context.schoolId),
        eq(membershipBranches.membershipId, membershipId),
      ),
    );
  if (access.scope === "branch") {
    await tx.insert(membershipBranches).values(
      [...new Set(access.branchIds)].map((branchId) => ({
        schoolId: context.schoolId,
        membershipId,
        branchId,
      })),
    );
  }
}

async function replaceRoles(
  tx: Transaction,
  context: TenantContext,
  membershipId: string,
  roleIds: string[],
) {
  await tx
    .delete(membershipRoles)
    .where(
      and(
        eq(membershipRoles.schoolId, context.schoolId),
        eq(membershipRoles.membershipId, membershipId),
      ),
    );
  await tx
    .insert(membershipRoles)
    .values(
      [...new Set(roleIds)].map((roleId) => ({ schoolId: context.schoolId, membershipId, roleId })),
    );
}

async function issueInvitation(
  tx: Transaction,
  context: TenantContext,
  userId: string,
): Promise<string> {
  const token = generateToken();
  await tx
    .update(userInvitations)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(userInvitations.schoolId, context.schoolId),
        eq(userInvitations.userId, userId),
        isNull(userInvitations.acceptedAt),
        isNull(userInvitations.revokedAt),
      ),
    );
  await tx.insert(userInvitations).values({
    schoolId: context.schoolId,
    userId,
    invitedByUserId: context.userId,
    tokenHash: hashToken(token),
    expiresAt: sql`now() + make_interval(secs => ${INVITATION_TTL_SECONDS})`,
  });
  return token;
}

function invitationEmail(input: { to: string; name: string; school: string; link?: string }) {
  return {
    to: input.to,
    subject: input.link
      ? `You're invited to ${input.school}`
      : `You now have access to ${input.school}`,
    text: input.link
      ? [
          `Hello ${input.name},`,
          "",
          `You have been invited to join ${input.school} on School Management.`,
          "Use this link to set your password and activate your account:",
          input.link,
          "",
          "The link expires in 7 days and can be used once.",
        ].join("\n")
      : [
          `Hello ${input.name},`,
          "",
          `You have been given access to ${input.school}. Sign in with your existing account to start.`,
        ].join("\n"),
  };
}

export async function inviteMember(
  db: Database,
  context: TenantContext,
  mailer: Mailer,
  input: unknown,
  appUrl: string,
): Promise<{ membershipId: string; userId: string; invitationSent: boolean }> {
  requirePermission(context, "users.invite");
  const data = inviteInput.parse(input);
  const email = normalizeEmail(data.email);

  const result = await withTenant(db, context, async (tx) => {
    await assertCanGrantAccess(tx, context, data.access);
    const grantedRoles = await assertCanGrantRoles(tx, context, data.roleIds);

    let [user] = await tx
      .select({ id: users.id, status: users.status, displayName: users.displayName })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (user && (user.status === "suspended" || user.status === "deactivated")) {
      throw new ConflictError("This account is not active. Contact support to restore it.");
    }
    if (user) {
      const [existing] = await tx
        .select({ id: schoolMemberships.id })
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.schoolId, context.schoolId),
            eq(schoolMemberships.userId, user.id),
          ),
        )
        .limit(1);
      if (existing) throw new ConflictError("This person is already a member of this school.");
    } else {
      [user] = await tx
        .insert(users)
        .values({ email, displayName: data.displayName, status: "invited" })
        .returning({ id: users.id, status: users.status, displayName: users.displayName });
    }

    const [membership] = await tx
      .insert(schoolMemberships)
      .values({
        schoolId: context.schoolId,
        userId: user.id,
        scope: data.access.scope,
        status: "active",
      })
      .returning({ id: schoolMemberships.id });
    await replaceAccess(tx, context, membership.id, data.access);
    await replaceRoles(tx, context, membership.id, data.roleIds);

    const token = user.status === "invited" ? await issueInvitation(tx, context, user.id) : null;
    const [school] = await tx
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, context.schoolId));
    await recordAudit(tx, context, {
      action: "user.invite",
      targetType: "membership",
      targetId: membership.id,
      metadata: {
        userId: user.id,
        roles: grantedRoles.map((r) => r.key).sort(),
        scope: data.access.scope,
        branchCount: data.access.scope === "branch" ? data.access.branchIds.length : 0,
        newAccount: token !== null,
      },
    });
    return {
      membershipId: membership.id,
      userId: user.id,
      name: user.displayName,
      school: school.name,
      token,
    };
  });

  // Send after commit, so a mail failure never leaves a half-created invitation behind.
  await mailer.send(
    invitationEmail({
      to: email,
      name: result.name,
      school: result.school,
      link: result.token ? `${appUrl}/accept-invitation#token=${result.token}` : undefined,
    }),
  );
  return {
    membershipId: result.membershipId,
    userId: result.userId,
    invitationSent: result.token !== null,
  };
}

export async function resendInvitation(
  db: Database,
  context: TenantContext,
  mailer: Mailer,
  membershipId: string,
  appUrl: string,
): Promise<boolean> {
  requirePermission(context, "users.invite");
  const result = await withTenant(db, context, async (tx) => {
    const member = await manageableMember(tx, context, membershipId);
    if (!member || member.userStatus !== "invited") return null;
    const token = await issueInvitation(tx, context, member.userId);
    const [school] = await tx
      .select({ name: schools.name })
      .from(schools)
      .where(eq(schools.id, context.schoolId));
    await recordAudit(tx, context, {
      action: "user.invite.resend",
      targetType: "membership",
      targetId: member.membershipId,
    });
    return { member, token, school: school.name };
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

export async function setMemberRoles(
  db: Database,
  context: TenantContext,
  membershipId: string,
  input: unknown,
): Promise<MemberView | null> {
  requirePermission(context, "users.assign_roles");
  const roleIds = roleIdsInput.parse(input);
  return withTenant(db, context, async (tx) => {
    const member = await manageableMember(tx, context, membershipId);
    if (!member) return null;
    const granted = await assertCanGrantRoles(tx, context, roleIds);
    await replaceRoles(tx, context, member.membershipId, roleIds);
    await recordAudit(tx, context, {
      action: "user.roles.update",
      targetType: "membership",
      targetId: member.membershipId,
      metadata: {
        before: member.roles.map((r) => r.key).sort(),
        after: granted.map((r) => r.key).sort(),
      },
    });
    return findVisibleMember(tx, context, member.membershipId);
  });
}

export async function setMemberAccess(
  db: Database,
  context: TenantContext,
  membershipId: string,
  input: unknown,
): Promise<MemberView | null> {
  requirePermission(context, "users.assign_roles");
  const access = accessInput.parse(input);
  return withTenant(db, context, async (tx) => {
    const member = await manageableMember(tx, context, membershipId);
    if (!member) return null;
    await assertCanGrantAccess(tx, context, access);
    await replaceAccess(tx, context, member.membershipId, access);
    await recordAudit(tx, context, {
      action: "user.access.update",
      targetType: "membership",
      targetId: member.membershipId,
      metadata: {
        before: { scope: member.scope, branchIds: member.branches.map((b) => b.id) },
        after: {
          scope: access.scope,
          branchIds: access.scope === "branch" ? access.branchIds : [],
        },
      },
    });
    // A branch admin who just moved someone outside their own branches can no longer see them.
    return findVisibleMember(tx, context, member.membershipId);
  });
}

/**
 * Suspend or restore a membership. Suspension takes effect on the person's next request,
 * because tenant context is re-resolved every time. If this school was their only one, the
 * account itself is deactivated and every session is revoked.
 */
export async function setMemberStatus(
  db: Database,
  context: TenantContext,
  membershipId: string,
  status: "active" | "suspended",
): Promise<MemberView | null> {
  requirePermission(context, "users.deactivate");
  if (status !== "active" && status !== "suspended") throw new ForbiddenError();
  return withTenant(db, context, async (tx) => {
    const member = await manageableMember(tx, context, membershipId);
    if (!member) return null;

    await tx
      .update(schoolMemberships)
      .set({ status })
      .where(
        and(
          eq(schoolMemberships.schoolId, context.schoolId),
          eq(schoolMemberships.id, member.membershipId),
        ),
      );

    // RLS hides other schools' memberships, by design. This definer function returns only a
    // count, and only for members of the current school.
    const otherActive = await tx.execute<{ n: number }>(
      sql`select app.count_other_memberships(${member.userId}, ${context.schoolId}, true) as n`,
    );
    const hasOtherSchools = Number(otherActive.rows[0].n) > 0;

    if (status === "suspended") {
      if (!hasOtherSchools && member.userStatus !== "invited") {
        await tx.update(users).set({ status: "deactivated" }).where(eq(users.id, member.userId));
        await revokeUserSessions(tx, member.userId);
      } else {
        // Keep their other schools working, but drop this school as the selected context.
        await tx
          .update(sessions)
          .set({ activeSchoolId: null })
          .where(
            and(eq(sessions.userId, member.userId), eq(sessions.activeSchoolId, context.schoolId)),
          );
      }
    } else if (member.userStatus === "deactivated") {
      const [{ hasPassword }] = await tx
        .select({ hasPassword: sql<boolean>`${users.passwordHash} is not null` })
        .from(users)
        .where(eq(users.id, member.userId));
      await tx
        .update(users)
        .set({ status: hasPassword ? "active" : "invited" })
        .where(eq(users.id, member.userId));
    }

    await recordAudit(tx, context, {
      action: status === "suspended" ? "user.deactivate" : "user.reactivate",
      targetType: "membership",
      targetId: member.membershipId,
      metadata: { accountDeactivated: status === "suspended" && !hasOtherSchools },
    });
    return findVisibleMember(tx, context, member.membershipId);
  });
}

/**
 * Edit a member's display name. Names are global to the account, so an administrator may only
 * change them for people who belong to no other school; otherwise one school could rename a
 * person everywhere.
 */
export async function updateMemberProfile(
  db: Database,
  context: TenantContext,
  membershipId: string,
  input: unknown,
): Promise<MemberView | null> {
  requirePermission(context, "users.update");
  const data = profileInput.parse(input);
  return withTenant(db, context, async (tx) => {
    const member = await manageableMember(tx, context, membershipId, { allowSelf: true });
    if (!member) return null;
    const other = await tx.execute<{ n: number }>(
      sql`select app.count_other_memberships(${member.userId}, ${context.schoolId}, false) as n`,
    );
    if (Number(other.rows[0].n) > 0) {
      throw new ForbiddenError(
        "This person also belongs to another school, so only they can change their name.",
      );
    }
    await tx
      .update(users)
      .set({ displayName: data.displayName })
      .where(eq(users.id, member.userId));
    await recordAudit(tx, context, {
      action: "user.profile.update",
      targetType: "membership",
      targetId: member.membershipId,
      metadata: { fields: ["displayName"] },
    });
    return findVisibleMember(tx, context, member.membershipId);
  });
}

/**
 * Storage key of a profile photo the caller may view: a member of the caller's school that the
 * caller can see (users.read + scope). Returns null otherwise — including for other schools.
 */
export async function getVisibleAvatarKey(
  db: Database,
  context: TenantContext,
  userId: string,
): Promise<string | null> {
  if (!uuid.safeParse(userId).success || !context.permissions.includes("users.read")) return null;
  return withTenant(db, context, async (tx) => {
    const [row] = await tx
      .select({ key: users.avatarKey })
      .from(schoolMemberships)
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .where(and(visibleMembershipsFilter(context), eq(schoolMemberships.userId, userId)))
      .limit(1);
    return row?.key ?? null;
  });
}
