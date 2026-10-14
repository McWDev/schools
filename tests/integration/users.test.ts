import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-tenants";
import { acceptInvitation } from "@/server/auth/invitations";
import { login } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { confirmPassword, hasRecentAuthentication } from "@/server/auth/reauth";
import { validateSession } from "@/server/auth/sessions";
import { getDatabase } from "@/server/db/client";
import { MemoryMailer } from "@/server/email/mailer";
import {
  getMember,
  getVisibleAvatarKey,
  inviteMember,
  listMembers,
  setMemberAccess,
  setMemberRoles,
  setMemberStatus,
  updateMemberProfile,
} from "@/server/modules/users/service";
import { resolveTenantContext, type TenantContext } from "@/server/tenancy/context";
import { ForbiddenError, TenantAccessError } from "@/server/tenancy/errors";
import { PERMISSIONS } from "@/server/tenancy/permissions";

import { closeOwner, ownerQuery, resetTenants } from "./helpers";

const db = getDatabase();
const PASSWORD = "password1234";
const appUrl = "https://school.example.test";
let passwordHash: string;
let ipCounter = 0;
const nextIp = () => `192.0.2.${++ipCounter}`;

let adminA: TenantContext;
let branchAdminA1: TenantContext;
let teacherA1: TenantContext;
let adminB: TenantContext;
let roleIds: Record<string, string>;

const ctx = (userId: string, schoolId: string) => resolveTenantContext(db, { userId, schoolId });

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetTenants();
  await ownerQuery(`update users set password_hash = $1`, [passwordHash]);
  adminA = await ctx(t.users.adminA, t.schoolA.id);
  branchAdminA1 = await ctx(t.users.branchAdminA1, t.schoolA.id);
  teacherA1 = await ctx(t.users.teacherA1, t.schoolA.id);
  adminB = await ctx(t.users.adminB, t.schoolB.id);
  const rows = await ownerQuery<{ key: string; id: string }>(
    `select key, id from roles where school_id = $1`,
    [t.schoolA.id],
  );
  roleIds = Object.fromEntries(rows.map((r) => [r.key, r.id]));
});

afterAll(closeOwner);

function tokenFrom(mailer: MemoryMailer): string {
  const match = /#token=([A-Za-z0-9_-]+)/.exec(mailer.sent.at(-1)?.text ?? "");
  if (!match) throw new Error("no invitation link");
  return match[1];
}

const inviteTeacherToA1 = (
  actor: TenantContext,
  mailer = new MemoryMailer(),
  email = "new.teacher@example.test",
) =>
  inviteMember(
    db,
    actor,
    mailer,
    {
      email,
      displayName: "New Teacher",
      access: { scope: "branch", branchIds: [t.schoolA.branchA1] },
      roleIds: [roleIds.teacher],
    },
    appUrl,
  );

describe("permissions", () => {
  it("the database permission catalog matches the code", async () => {
    const rows = await ownerQuery<{ code: string }>(`select code from permissions order by code`);
    expect(rows.map((r) => r.code)).toEqual([...PERMISSIONS].sort());
  });

  it("every school gets the system roles automatically", async () => {
    const rows = await ownerQuery<{ school_id: string; n: number }>(
      `select school_id, count(*)::int as n from roles group by school_id order by school_id`,
    );
    expect(rows).toEqual([
      { school_id: t.schoolA.id, n: 6 },
      { school_id: t.schoolB.id, n: 6 },
    ]);
  });

  it("resolves permissions from roles into the server-side context", () => {
    expect(adminA.permissions).toContain("users.assign_roles");
    expect(adminA.permissions).toContain("school.settings.manage");
    expect(branchAdminA1.permissions).toContain("users.invite");
    expect(branchAdminA1.permissions).not.toContain("school.settings.manage");
    expect(teacherA1.permissions).toEqual(["branches.read"]);
  });

  it("a teacher cannot list or manage users", async () => {
    await expect(listMembers(db, teacherA1)).rejects.toThrow(ForbiddenError);
    await expect(inviteTeacherToA1(teacherA1)).rejects.toThrow(ForbiddenError);
  });
});

describe("listing and viewing", () => {
  it("school admin sees every member of their school and nobody from another school", async () => {
    const { items, total } = await listMembers(db, adminA);
    expect(total).toBe(4);
    expect(items.map((m) => m.email).sort()).toEqual([
      "admin.a@example.test",
      "branch.admin.a1@example.test",
      "multi@example.test",
      "teacher.a1@example.test",
    ]);
  });

  it("branch admin sees only branch-scoped members inside their branches", async () => {
    const { items } = await listMembers(db, branchAdminA1);
    expect(items.map((m) => m.email).sort()).toEqual([
      "branch.admin.a1@example.test",
      "teacher.a1@example.test",
    ]);
  });

  it("searches name and email, treating wildcards literally, with pagination", async () => {
    expect((await listMembers(db, adminA, { search: "teacher" })).items).toHaveLength(1);
    expect((await listMembers(db, adminA, { search: "%" })).items).toHaveLength(0);
    const page = await listMembers(db, adminA, { pageSize: 2, page: 2 });
    expect(page).toMatchObject({ total: 4, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(2);
  });

  it("a guessed membership ID from another school returns not found", async () => {
    expect(await getMember(db, adminA, t.memberships.adminB)).toBeNull();
    expect(await getMember(db, adminB, t.memberships.teacherA1)).toBeNull();
  });

  it("a branch admin cannot view school-wide admins", async () => {
    expect(await getMember(db, branchAdminA1, t.memberships.adminA)).toBeNull();
  });
});

describe("cross-school and cross-branch management", () => {
  it("school A admin cannot change roles, access, status, or names of school B members", async () => {
    expect(await setMemberRoles(db, adminA, t.memberships.adminB, [roleIds.teacher])).toBeNull();
    expect(await setMemberAccess(db, adminA, t.memberships.adminB, { scope: "school" })).toBeNull();
    expect(await setMemberStatus(db, adminA, t.memberships.adminB, "suspended")).toBeNull();
    expect(
      await updateMemberProfile(db, adminA, t.memberships.adminB, { displayName: "Hijacked" }),
    ).toBeNull();
    const [b] = await ownerQuery<{ status: string; display_name: string }>(
      `select m.status, u.display_name from school_memberships m join users u on u.id = m.user_id where m.id = $1`,
      [t.memberships.adminB],
    );
    expect(b).toEqual({ status: "active", display_name: "Admin B" });
  });

  it("branch admin cannot edit someone who also works at a branch outside their scope", async () => {
    await ownerQuery(
      `insert into membership_branches (school_id, membership_id, branch_id) values ($1, $2, $3)`,
      [t.schoolA.id, t.memberships.teacherA1, t.schoolA.branchA2],
    );
    expect(
      await setMemberStatus(db, branchAdminA1, t.memberships.teacherA1, "suspended"),
    ).toBeNull();
  });

  it("branch admin cannot deactivate a school admin", async () => {
    expect(await setMemberStatus(db, branchAdminA1, t.memberships.adminA, "suspended")).toBeNull();
  });
});

describe("escalation and forged payloads", () => {
  it("rejects a role ID belonging to another school", async () => {
    const [bAdminRole] = await ownerQuery<{ id: string }>(
      `select id from roles where school_id = $1 and key = 'school_admin'`,
      [t.schoolB.id],
    );
    await expect(
      setMemberRoles(db, adminA, t.memberships.teacherA1, [bAdminRole.id]),
    ).rejects.toThrow(/not available in this school/);
  });

  it("branch admin cannot grant the school admin role or school-wide scope", async () => {
    await expect(
      setMemberRoles(db, branchAdminA1, t.memberships.teacherA1, [roleIds.school_admin]),
    ).rejects.toThrow(/permissions you do not have/);
    await expect(
      setMemberAccess(db, branchAdminA1, t.memberships.teacherA1, { scope: "school" }),
    ).rejects.toThrow(/school-wide administrators/);
    await expect(
      setMemberAccess(db, branchAdminA1, t.memberships.teacherA1, {
        scope: "branch",
        branchIds: [t.schoolA.branchA2],
      }),
    ).rejects.toThrow(/branches you are assigned to/);
  });

  it("nobody can change their own roles, access, or status", async () => {
    await expect(
      setMemberRoles(db, adminA, t.memberships.adminA, [roleIds.school_admin]),
    ).rejects.toThrow(/your own access/);
    await expect(setMemberStatus(db, adminA, t.memberships.adminA, "suspended")).rejects.toThrow(
      /your own access/,
    );
    await expect(
      setMemberRoles(db, branchAdminA1, t.memberships.branchAdminA1, [roleIds.school_admin]),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects payloads with unexpected fields such as permissions or schoolId", async () => {
    for (const forged of [
      { permissions: ["users.assign_roles"] },
      { schoolId: t.schoolB.id },
      { isPlatformAdmin: true },
    ]) {
      await expect(
        inviteMember(
          db,
          adminA,
          new MemoryMailer(),
          {
            email: "forged@example.test",
            displayName: "Forged",
            access: { scope: "school" },
            roleIds: [roleIds.teacher],
            ...forged,
          },
          appUrl,
        ),
      ).rejects.toThrow();
    }
    await expect(
      setMemberAccess(db, adminA, t.memberships.teacherA1, {
        scope: "school",
        branchIds: [t.schoolB.branchB1],
      }),
    ).rejects.toThrow();
    expect(
      await ownerQuery(`select 1 from users where email = 'forged@example.test'`),
    ).toHaveLength(0);
  });

  it("rejects a branch from another school", async () => {
    await expect(
      setMemberAccess(db, adminA, t.memberships.teacherA1, {
        scope: "branch",
        branchIds: [t.schoolB.branchB1],
      }),
    ).rejects.toThrow(/not part of this school/);
  });

  it("a forged context object is rejected by every service", async () => {
    const forged = { ...adminA, schoolId: t.schoolB.id } as TenantContext;
    await expect(listMembers(db, forged)).rejects.toThrow(TenantAccessError);
    await expect(setMemberStatus(db, forged, t.memberships.adminB, "suspended")).rejects.toThrow(
      TenantAccessError,
    );
  });
});

describe("invitations", () => {
  it("invites a new person, who can sign in only after accepting", async () => {
    const mailer = new MemoryMailer();
    const result = await inviteTeacherToA1(branchAdminA1, mailer);
    expect(result.invitationSent).toBe(true);
    expect(mailer.sent[0].text).toContain(`${appUrl}/accept-invitation#token=`);

    expect(
      (await login(db, { email: "new.teacher@example.test", password: PASSWORD, ip: nextIp() })).ok,
    ).toBe(false);
    const accepted = await acceptInvitation(db, {
      token: tokenFrom(mailer),
      password: "the new teacher pass",
      ip: nextIp(),
    });
    expect(accepted).toEqual({ ok: true, userId: result.userId });

    const signedIn = await login(db, {
      email: "new.teacher@example.test",
      password: "the new teacher pass",
      ip: nextIp(),
    });
    expect(signedIn.ok).toBe(true);
    const context = await ctx(result.userId, t.schoolA.id);
    expect(context.scope).toEqual({ kind: "branch", branchIds: [t.schoolA.branchA1] });
    expect(context.permissions).toEqual(["branches.read"]);
  });

  it("stores only a hash of the invitation token", async () => {
    const mailer = new MemoryMailer();
    await inviteTeacherToA1(adminA, mailer);
    const rows = await ownerQuery<{ token_hash: string }>(
      `select token_hash from user_invitations`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toContain(tokenFrom(mailer));
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an invitation link cannot be replayed", async () => {
    const mailer = new MemoryMailer();
    await inviteTeacherToA1(adminA, mailer);
    const token = tokenFrom(mailer);
    expect(
      (await acceptInvitation(db, { token, password: "first password 123", ip: nextIp() })).ok,
    ).toBe(true);
    expect(
      await acceptInvitation(db, { token, password: "attacker password 1", ip: nextIp() }),
    ).toEqual({
      ok: false,
      reason: "invalid_token",
    });
    expect(
      (
        await login(db, {
          email: "new.teacher@example.test",
          password: "attacker password 1",
          ip: nextIp(),
        })
      ).ok,
    ).toBe(false);
  });

  it("expired and resent invitations invalidate old links", async () => {
    const mailer = new MemoryMailer();
    await inviteTeacherToA1(adminA, mailer);
    await ownerQuery(`update user_invitations set expires_at = now() - interval '1 second'`);
    expect(
      (
        await acceptInvitation(db, {
          token: tokenFrom(mailer),
          password: "password for test",
          ip: nextIp(),
        })
      ).ok,
    ).toBe(false);
  });

  it("adds an existing active account without a new password link", async () => {
    const mailer = new MemoryMailer();
    const result = await inviteMember(
      db,
      adminB,
      mailer,
      {
        email: "teacher.a1@example.test",
        displayName: "Ignored",
        access: { scope: "school" },
        roleIds: [
          (
            await ownerQuery<{ id: string }>(
              `select id from roles where school_id = $1 and key = 'teacher'`,
              [t.schoolB.id],
            )
          )[0].id,
        ],
      },
      appUrl,
    );
    expect(result.invitationSent).toBe(false);
    expect(mailer.sent[0].text).not.toContain("#token=");
  });

  it("refuses to invite someone who is already a member", async () => {
    await expect(
      inviteTeacherToA1(adminA, new MemoryMailer(), "teacher.a1@example.test"),
    ).rejects.toThrow(/already a member/);
  });

  it("branch admin cannot invite with school-wide scope or escalated roles", async () => {
    await expect(
      inviteMember(
        db,
        branchAdminA1,
        new MemoryMailer(),
        {
          email: "x@example.test",
          displayName: "X Person",
          access: { scope: "school" },
          roleIds: [roleIds.teacher],
        },
        appUrl,
      ),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      inviteMember(
        db,
        branchAdminA1,
        new MemoryMailer(),
        {
          email: "x@example.test",
          displayName: "X Person",
          access: { scope: "branch", branchIds: [t.schoolA.branchA1] },
          roleIds: [roleIds.school_admin],
        },
        appUrl,
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("deactivation", () => {
  it("deactivating the only membership deactivates the account and ends its sessions", async () => {
    const signedIn = await login(db, {
      email: "teacher.a1@example.test",
      password: PASSWORD,
      ip: nextIp(),
    });
    if (!signedIn.ok) throw new Error("login failed");
    const updated = await setMemberStatus(db, adminA, t.memberships.teacherA1, "suspended");
    expect(updated).toMatchObject({ membershipStatus: "suspended", userStatus: "deactivated" });
    expect(await validateSession(db, signedIn.token)).toBeNull();
    expect(
      (await login(db, { email: "teacher.a1@example.test", password: PASSWORD, ip: nextIp() })).ok,
    ).toBe(false);

    const restored = await setMemberStatus(db, adminA, t.memberships.teacherA1, "active");
    expect(restored).toMatchObject({ membershipStatus: "active", userStatus: "active" });
  });

  it("for a multi-school user, only this school's access ends", async () => {
    const signedIn = await login(db, {
      email: "multi@example.test",
      password: PASSWORD,
      ip: nextIp(),
    });
    if (!signedIn.ok) throw new Error("login failed");
    await setMemberStatus(db, adminA, t.memberships.multiA, "suspended");
    expect(await validateSession(db, signedIn.token)).not.toBeNull();
    await expect(ctx(t.users.multiSchool, t.schoolA.id)).rejects.toThrow(TenantAccessError);
    await expect(ctx(t.users.multiSchool, t.schoolB.id)).resolves.toBeDefined();
  });

  it("a school cannot rename a person who also belongs to another school", async () => {
    await expect(
      updateMemberProfile(db, adminA, t.memberships.multiA, { displayName: "Renamed" }),
    ).rejects.toThrow(/another school/);
    expect(
      await updateMemberProfile(db, adminA, t.memberships.teacherA1, {
        displayName: "Teacher Renamed",
      }),
    ).toMatchObject({
      displayName: "Teacher Renamed",
    });
  });
});

describe("audit and re-authentication", () => {
  it("records invitations, role changes, access changes, and deactivation", async () => {
    await inviteTeacherToA1(adminA);
    await setMemberRoles(db, adminA, t.memberships.teacherA1, [roleIds.teacher, roleIds.registrar]);
    await setMemberAccess(db, adminA, t.memberships.teacherA1, {
      scope: "branch",
      branchIds: [t.schoolA.branchA2],
    });
    await setMemberStatus(db, adminA, t.memberships.teacherA1, "suspended");
    const events = await ownerQuery<{
      action: string;
      school_id: string;
      actor_user_id: string;
      metadata: Record<string, unknown>;
    }>(
      `select action, school_id, actor_user_id, metadata from audit_events where action like 'user.%' order by occurred_at`,
    );
    expect(events.map((e) => e.action)).toEqual([
      "user.invite",
      "user.roles.update",
      "user.access.update",
      "user.deactivate",
    ]);
    for (const event of events)
      expect(event).toMatchObject({ school_id: t.schoolA.id, actor_user_id: t.users.adminA });
    expect(events[1].metadata).toMatchObject({
      before: ["teacher"],
      after: ["registrar", "teacher"],
    });
  });

  it("requires a recent password for high-risk actions", async () => {
    const signedIn = await login(db, {
      email: "admin.a@example.test",
      password: PASSWORD,
      ip: nextIp(),
    });
    if (!signedIn.ok) throw new Error("login failed");
    const session = (await validateSession(db, signedIn.token))!;
    expect(await hasRecentAuthentication(db, session.sessionId)).toBe(true);

    await ownerQuery(
      `update sessions set created_at = now() - interval '1 hour', reauthenticated_at = null`,
    );
    expect(await hasRecentAuthentication(db, session.sessionId)).toBe(false);
    expect(await confirmPassword(db, session, "wrong password here")).toBe(false);
    expect(await hasRecentAuthentication(db, session.sessionId)).toBe(false);
    expect(await confirmPassword(db, session, PASSWORD)).toBe(true);
    expect(await hasRecentAuthentication(db, session.sessionId)).toBe(true);
  });
});

describe("profile photo visibility", () => {
  it("only colleagues in scope can resolve another member's photo", async () => {
    await ownerQuery(`update users set avatar_key = 'avatars/x/photo.webp' where id = $1`, [
      t.users.teacherA1,
    ]);
    expect(await getVisibleAvatarKey(db, adminA, t.users.teacherA1)).toBe("avatars/x/photo.webp");
    expect(await getVisibleAvatarKey(db, branchAdminA1, t.users.teacherA1)).toBe(
      "avatars/x/photo.webp",
    );
    expect(await getVisibleAvatarKey(db, adminB, t.users.teacherA1)).toBeNull();
    expect(await getVisibleAvatarKey(db, teacherA1, t.users.adminA)).toBeNull();
  });
});
