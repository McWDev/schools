import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-school";
import { resolveAccessContext, type AccessContext } from "@/server/access/context";
import { AccessDeniedError, ForbiddenError } from "@/server/access/errors";
import { PERMISSIONS } from "@/server/access/permissions";
import { acceptInvitation } from "@/server/auth/invitations";
import { login } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { confirmPassword, hasRecentAuthentication } from "@/server/auth/reauth";
import { validateSession } from "@/server/auth/sessions";
import { getDatabase } from "@/server/db/client";
import { MemoryMailer } from "@/server/email/mailer";
import {
  getStaff,
  getVisibleAvatarKey,
  inviteStaff,
  listStaff,
  setStaffAccess,
  setStaffRoles,
  setStaffStatus,
  updateStaffProfile,
} from "@/server/modules/users/service";

import { closeOwner, ownerQuery, resetSchool } from "./helpers";

const db = getDatabase();
const PASSWORD = "password1234";
const appUrl = "https://school.example.test";
let passwordHash: string;
let ipCounter = 0;
const nextIp = () => `192.0.2.${++ipCounter}`;

let admin: AccessContext;
let mainBranchAdmin: AccessContext;
let mainTeacher: AccessContext;
let roleIds: Record<string, string>;

const resolve = (userId: string) => resolveAccessContext(db, userId);

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetSchool();
  await ownerQuery(`update users set password_hash = $1`, [passwordHash]);
  [admin, mainBranchAdmin, mainTeacher] = await Promise.all(
    [t.users.admin, t.users.mainBranchAdmin, t.users.mainTeacher].map(resolve),
  );
  const rows = await ownerQuery<{ key: string; id: string }>(`select key, id from roles`);
  roleIds = Object.fromEntries(rows.map((r) => [r.key, r.id]));
});

afterAll(closeOwner);

function tokenFrom(mailer: MemoryMailer): string {
  const match = /#token=([A-Za-z0-9_-]+)/.exec(mailer.sent.at(-1)?.text ?? "");
  if (!match) throw new Error("no invitation link");
  return match[1];
}

const inviteMainTeacher = (
  actor: AccessContext,
  mailer = new MemoryMailer(),
  email = "new.teacher@example.test",
) =>
  inviteStaff(
    db,
    actor,
    mailer,
    {
      email,
      displayName: "New Teacher",
      access: { scope: "branch", branchIds: [t.branches.main] },
      roleIds: [roleIds.teacher],
    },
    appUrl,
  );

describe("permissions", () => {
  it("the database permission catalog matches the code", async () => {
    const rows = await ownerQuery<{ code: string }>(`select code from permissions order by code`);
    expect(rows.map((r) => r.code)).toEqual([...PERMISSIONS].sort());
  });

  it("installs the six system roles once", async () => {
    const rows = await ownerQuery<{ key: string }>(`select key from roles order by key`);
    expect(rows.map((r) => r.key)).toEqual([
      "auditor",
      "branch_admin",
      "finance_officer",
      "registrar",
      "school_admin",
      "teacher",
    ]);
  });

  it("resolves permissions from roles into the server-side context", () => {
    expect(admin.permissions).toContain("users.assign_roles");
    expect(admin.permissions).toContain("school.settings.manage");
    expect(mainBranchAdmin.permissions).toContain("users.invite");
    expect(mainBranchAdmin.permissions).not.toContain("school.settings.manage");
    expect(mainTeacher.permissions).toEqual(["branches.read"]);
  });

  it("a teacher cannot list or manage staff", async () => {
    await expect(listStaff(db, mainTeacher)).rejects.toThrow(ForbiddenError);
    await expect(inviteMainTeacher(mainTeacher)).rejects.toThrow(ForbiddenError);
  });
});

describe("listing and viewing", () => {
  it("school admin sees every staff member", async () => {
    const { items, total } = await listStaff(db, admin);
    expect(total).toBe(4);
    expect(items.map((m) => m.email).sort()).toEqual([
      "admin@example.test",
      "main.admin@example.test",
      "main.teacher@example.test",
      "north.teacher@example.test",
    ]);
  });

  it("branch admin sees only branch staff inside their branches", async () => {
    const { items } = await listStaff(db, mainBranchAdmin);
    expect(items.map((m) => m.email).sort()).toEqual([
      "main.admin@example.test",
      "main.teacher@example.test",
    ]);
  });

  it("searches name and email, treating wildcards literally, with pagination", async () => {
    expect((await listStaff(db, admin, { search: "north" })).items).toHaveLength(1);
    expect((await listStaff(db, admin, { search: "%" })).items).toHaveLength(0);
    const page = await listStaff(db, admin, { pageSize: 3, page: 2 });
    expect(page).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page.items).toHaveLength(1);
  });

  it("a branch admin cannot view staff of another branch or school-wide admins", async () => {
    expect(await getStaff(db, mainBranchAdmin, t.users.northTeacher)).toBeNull();
    expect(await getStaff(db, mainBranchAdmin, t.users.admin)).toBeNull();
  });
});

describe("cross-branch management", () => {
  it("branch admin cannot change roles, access, status, or names outside their branch", async () => {
    const target = t.users.northTeacher;
    expect(await setStaffRoles(db, mainBranchAdmin, target, [roleIds.teacher])).toBeNull();
    expect(
      await setStaffAccess(db, mainBranchAdmin, target, {
        scope: "branch",
        branchIds: [t.branches.main],
      }),
    ).toBeNull();
    expect(await setStaffStatus(db, mainBranchAdmin, target, "deactivated")).toBeNull();
    expect(
      await updateStaffProfile(db, mainBranchAdmin, target, { displayName: "Hijacked" }),
    ).toBeNull();
    const [row] = await ownerQuery<{ status: string; display_name: string }>(
      `select status, display_name from users where id = $1`,
      [target],
    );
    expect(row).toEqual({ status: "active", display_name: "North Teacher" });
  });

  it("branch admin cannot manage someone who also works at a branch outside their scope", async () => {
    await ownerQuery(`insert into user_branches (user_id, branch_id) values ($1, $2)`, [
      t.users.mainTeacher,
      t.branches.north,
    ]);
    expect(
      await setStaffStatus(db, mainBranchAdmin, t.users.mainTeacher, "deactivated"),
    ).toBeNull();
  });

  it("branch admin cannot deactivate the school admin", async () => {
    expect(await setStaffStatus(db, mainBranchAdmin, t.users.admin, "deactivated")).toBeNull();
  });
});

describe("escalation and forged payloads", () => {
  it("branch admin cannot grant the school admin role or school-wide scope", async () => {
    await expect(
      setStaffRoles(db, mainBranchAdmin, t.users.mainTeacher, [roleIds.school_admin]),
    ).rejects.toThrow(/permissions you do not have/);
    await expect(
      setStaffAccess(db, mainBranchAdmin, t.users.mainTeacher, { scope: "school" }),
    ).rejects.toThrow(/school-wide administrators/);
    await expect(
      setStaffAccess(db, mainBranchAdmin, t.users.mainTeacher, {
        scope: "branch",
        branchIds: [t.branches.north],
      }),
    ).rejects.toThrow(/branches you are assigned to/);
  });

  it("nobody can change their own roles, access, or status", async () => {
    await expect(setStaffRoles(db, admin, t.users.admin, [roleIds.school_admin])).rejects.toThrow(
      /your own access/,
    );
    await expect(setStaffStatus(db, admin, t.users.admin, "deactivated")).rejects.toThrow(
      /your own access/,
    );
    await expect(
      setStaffRoles(db, mainBranchAdmin, t.users.mainBranchAdmin, [roleIds.school_admin]),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects payloads with unexpected fields such as permissions or status", async () => {
    for (const forged of [
      { permissions: ["users.assign_roles"] },
      { status: "active" },
      { accessScope: "school" },
    ]) {
      await expect(
        inviteStaff(
          db,
          admin,
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
      setStaffAccess(db, admin, t.users.mainTeacher, {
        scope: "school",
        branchIds: [t.branches.north],
      }),
    ).rejects.toThrow();
    expect(
      await ownerQuery(`select 1 from users where email = 'forged@example.test'`),
    ).toHaveLength(0);
  });

  it("rejects branch and role IDs that do not exist", async () => {
    const ghost = "00000000-0000-4000-8000-999999999999";
    await expect(
      setStaffAccess(db, admin, t.users.mainTeacher, { scope: "branch", branchIds: [ghost] }),
    ).rejects.toThrow(/do not exist/);
    await expect(setStaffRoles(db, admin, t.users.mainTeacher, [ghost])).rejects.toThrow(
      /do not exist/,
    );
  });

  it("a forged context object is rejected by every service", async () => {
    const forged = { ...mainTeacher, scope: { kind: "school" } } as AccessContext;
    await expect(listStaff(db, forged)).rejects.toThrow(AccessDeniedError);
    await expect(setStaffStatus(db, forged, t.users.northTeacher, "deactivated")).rejects.toThrow(
      AccessDeniedError,
    );
  });
});

describe("invitations", () => {
  it("invites a new person, who can sign in only after accepting", async () => {
    const mailer = new MemoryMailer();
    const result = await inviteMainTeacher(mainBranchAdmin, mailer);
    expect(mailer.sent[0].text).toContain(`${appUrl}/accept-invitation#token=`);
    expect(mailer.sent[0].subject).toBe("You're invited to Example Academy");

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
    const context = await resolve(result.userId);
    expect(context.scope).toEqual({ kind: "branch", branchIds: [t.branches.main] });
    expect(context.permissions).toEqual(["branches.read"]);
  });

  it("stores only a hash of the invitation token", async () => {
    const mailer = new MemoryMailer();
    await inviteMainTeacher(admin, mailer);
    const rows = await ownerQuery<{ token_hash: string }>(
      `select token_hash from user_invitations`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toContain(tokenFrom(mailer));
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("an invitation link cannot be replayed", async () => {
    const mailer = new MemoryMailer();
    await inviteMainTeacher(admin, mailer);
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

  it("expired invitations do not work", async () => {
    const mailer = new MemoryMailer();
    await inviteMainTeacher(admin, mailer);
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

  it("refuses to invite an email that already has an account", async () => {
    await expect(
      inviteMainTeacher(admin, new MemoryMailer(), "main.teacher@example.test"),
    ).rejects.toThrow(/already exists/);
  });

  it("branch admin cannot invite with school-wide scope or escalated roles", async () => {
    await expect(
      inviteStaff(
        db,
        mainBranchAdmin,
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
      inviteStaff(
        db,
        mainBranchAdmin,
        new MemoryMailer(),
        {
          email: "x@example.test",
          displayName: "X Person",
          access: { scope: "branch", branchIds: [t.branches.main] },
          roleIds: [roleIds.school_admin],
        },
        appUrl,
      ),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe("deactivation", () => {
  it("removing access deactivates the account and ends its sessions immediately", async () => {
    const signedIn = await login(db, {
      email: "main.teacher@example.test",
      password: PASSWORD,
      ip: nextIp(),
    });
    if (!signedIn.ok) throw new Error("login failed");
    const updated = await setStaffStatus(db, admin, t.users.mainTeacher, "deactivated");
    expect(updated).toMatchObject({ status: "deactivated" });
    expect(await validateSession(db, signedIn.token)).toBeNull();
    expect(
      (await login(db, { email: "main.teacher@example.test", password: PASSWORD, ip: nextIp() }))
        .ok,
    ).toBe(false);
    await expect(resolve(t.users.mainTeacher)).rejects.toThrow(AccessDeniedError);

    const restored = await setStaffStatus(db, admin, t.users.mainTeacher, "active");
    expect(restored).toMatchObject({ status: "active" });
  });

  it("restoring someone who never set a password returns them to invited", async () => {
    await inviteMainTeacher(admin);
    const [invited] = await ownerQuery<{ id: string }>(
      `select id from users where email = 'new.teacher@example.test'`,
    );
    await setStaffStatus(db, admin, invited.id, "deactivated");
    expect(await setStaffStatus(db, admin, invited.id, "active")).toMatchObject({
      status: "invited",
    });
  });

  it("history is kept: records of a deactivated person remain", async () => {
    await setStaffRoles(db, admin, t.users.mainTeacher, [roleIds.teacher, roleIds.registrar]);
    await setStaffStatus(db, admin, t.users.mainTeacher, "deactivated");
    const [row] = await ownerQuery<{ n: number }>(
      `select count(*)::int as n from audit_events where target_id = $1`,
      [t.users.mainTeacher],
    );
    expect(row.n).toBe(2);
    expect(
      await ownerQuery(`select 1 from users where id = $1`, [t.users.mainTeacher]),
    ).toHaveLength(1);
  });

  it("administrators can correct a staff member's name", async () => {
    expect(
      await updateStaffProfile(db, admin, t.users.mainTeacher, { displayName: "Teacher Renamed" }),
    ).toMatchObject({ displayName: "Teacher Renamed" });
  });
});

describe("audit and re-authentication", () => {
  it("records invitations, role changes, access changes, and deactivation", async () => {
    await inviteMainTeacher(admin);
    await setStaffRoles(db, admin, t.users.mainTeacher, [roleIds.teacher, roleIds.registrar]);
    await setStaffAccess(db, admin, t.users.mainTeacher, {
      scope: "branch",
      branchIds: [t.branches.north],
    });
    await setStaffStatus(db, admin, t.users.mainTeacher, "deactivated");
    const events = await ownerQuery<{
      action: string;
      actor_user_id: string;
      metadata: Record<string, unknown>;
    }>(
      `select action, actor_user_id, metadata from audit_events where action like 'user.%' order by occurred_at`,
    );
    expect(events.map((e) => e.action)).toEqual([
      "user.invite",
      "user.roles.update",
      "user.access.update",
      "user.deactivate",
    ]);
    for (const event of events) expect(event.actor_user_id).toBe(t.users.admin);
    expect(events[1].metadata).toMatchObject({
      before: ["teacher"],
      after: ["registrar", "teacher"],
    });
  });

  it("requires a recent password for high-risk actions", async () => {
    const signedIn = await login(db, {
      email: "admin@example.test",
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
  it("only colleagues in scope can resolve another person's photo", async () => {
    await ownerQuery(`update users set avatar_key = 'avatars/x/photo.webp' where id = $1`, [
      t.users.mainTeacher,
    ]);
    expect(await getVisibleAvatarKey(db, admin, t.users.mainTeacher)).toBe("avatars/x/photo.webp");
    expect(await getVisibleAvatarKey(db, mainBranchAdmin, t.users.mainTeacher)).toBe(
      "avatars/x/photo.webp",
    );
    const north = await resolve(t.users.northTeacher);
    expect(await getVisibleAvatarKey(db, north, t.users.mainTeacher)).toBeNull();
    await ownerQuery(`update users set avatar_key = 'avatars/y/photo.webp' where id = $1`, [
      t.users.northTeacher,
    ]);
    expect(await getVisibleAvatarKey(db, mainBranchAdmin, t.users.northTeacher)).toBeNull();
  });
});
