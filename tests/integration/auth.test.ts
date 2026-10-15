import { createHash } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SYNTHETIC as t } from "../../scripts/lib/synthetic-school";
import { AuthValidationError } from "@/server/auth/errors";
import { login } from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import { requestPasswordReset, resetPassword } from "@/server/auth/password-reset";
import { revokeSessionByToken, setSessionBranch, validateSession } from "@/server/auth/sessions";
import { getDatabase } from "@/server/db/client";
import { MemoryMailer } from "@/server/email/mailer";

import { closeOwner, ownerQuery, resetSchool } from "./helpers";

const db = getDatabase();
const PASSWORD = "correct horse battery staple";
const NEW_PASSWORD = "a brand new passphrase 2026";
const appUrl = "https://school.example.test";
let passwordHash: string;
let ipCounter = 0;
/** A fresh client address per test keeps per-IP rate limits independent between tests. */
const nextIp = () => `198.51.100.${++ipCounter}`;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(async () => {
  await resetSchool();
  await ownerQuery(`update users set password_hash = $1`, [passwordHash]);
});

afterAll(closeOwner);

async function signIn(email = "admin@example.test", password = PASSWORD, ip = nextIp()) {
  return login(db, { email, password, ip, userAgent: "vitest" });
}

async function signInToken(email?: string): Promise<string> {
  const result = await signIn(email);
  if (!result.ok) throw new Error(`expected login to succeed: ${result.reason}`);
  return result.token;
}

function tokenFromEmail(mailer: MemoryMailer): string {
  const match = /#token=([A-Za-z0-9_-]+)/.exec(mailer.sent.at(-1)?.text ?? "");
  if (!match) throw new Error("no reset link in email");
  return match[1];
}

describe("login", () => {
  it("signs in with valid credentials and creates a validated session", async () => {
    const token = await signInToken();
    const session = await validateSession(db, token);
    expect(session).toMatchObject({ userId: t.users.admin, email: "admin@example.test" });
  });

  it("normalizes email case and surrounding spaces", async () => {
    expect((await signIn("  ADMIN@Example.TEST ")).ok).toBe(true);
  });

  it("returns the same generic failure for wrong password and unknown email", async () => {
    expect(await signIn("admin@example.test", "wrong password!!")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(await signIn("nobody@example.test")).toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
  });

  it("rejects users without a password yet (e.g. invited, not set up)", async () => {
    await ownerQuery(`update users set password_hash = null where id = $1`, [t.users.admin]);
    expect((await signIn()).ok).toBe(false);
  });

  it("rejects suspended and deactivated accounts with the generic failure", async () => {
    await ownerQuery(`update users set status = 'suspended' where id = $1`, [t.users.admin]);
    expect(await signIn()).toEqual({ ok: false, reason: "invalid_credentials" });
    await ownerQuery(`update users set status = 'deactivated' where id = $1`, [
      t.users.mainTeacher,
    ]);
    expect((await signIn("main.teacher@example.test")).ok).toBe(false);
  });

  it("records success and failure audit events without secrets", async () => {
    const token = await signInToken();
    await signIn("admin@example.test", "wrong password!!");
    const events = await ownerQuery<{ action: string; outcome: string; metadata: unknown }>(
      `select action, outcome, metadata from audit_events order by occurred_at`,
    );
    expect(events.map((e) => `${e.action}:${e.outcome}`)).toEqual([
      "auth.login:success",
      "auth.login:failure",
    ]);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("wrong password");
    expect(serialized).not.toContain(token);
  });
});

describe("sessions", () => {
  it("stores only a SHA-256 hash of the session token", async () => {
    const token = await signInToken();
    const rows = await ownerQuery<{ token_hash: string }>(`select token_hash from sessions`);
    expect(rows).toEqual([{ token_hash: createHash("sha256").update(token).digest("hex") }]);
  });

  it("logout revokes the session immediately", async () => {
    const token = await signInToken();
    await revokeSessionByToken(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const token = await signInToken();
    await ownerQuery(
      `update sessions set created_at = now() - interval '8 days', expires_at = now() - interval '1 second'`,
    );
    expect(await validateSession(db, token)).toBeNull();
  });

  it("rejects sessions idle longer than the idle timeout", async () => {
    const token = await signInToken();
    await ownerQuery(`update sessions set last_seen_at = now() - interval '13 hours'`);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("suspending a user ends their existing sessions on the next request", async () => {
    const token = await signInToken();
    expect(await validateSession(db, token)).not.toBeNull();
    await ownerQuery(`update users set status = 'suspended' where id = $1`, [t.users.admin]);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("rejects garbage, empty, and oversized tokens", async () => {
    for (const token of ["", "not-a-token", "x".repeat(5000)]) {
      expect(await validateSession(db, token)).toBeNull();
    }
  });

  it("stores a branch filter on the session and clears it if the branch is removed", async () => {
    const token = await signInToken();
    const session = await validateSession(db, token);
    await setSessionBranch(db, session!.sessionId, t.branches.north);
    expect(await validateSession(db, token)).toMatchObject({ activeBranchId: t.branches.north });
    // Staff and students block deleting a branch (history is preserved), so clear them first.
    await ownerQuery(`delete from user_branches where branch_id = $1`, [t.branches.north]);
    await ownerQuery(`delete from students where branch_id = $1`, [t.branches.north]);
    await ownerQuery(`delete from branches where id = $1`, [t.branches.north]);
    expect(await validateSession(db, token)).toMatchObject({ activeBranchId: null });
  });
});

describe("rate limiting", () => {
  it("blocks the 6th attempt for one email within the window, even with the right password", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect(await signIn("admin@example.test", "wrong password!!")).toMatchObject({
        reason: "invalid_credentials",
      });
    }
    const blocked = await signIn();
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(
      blocked.ok === false && blocked.reason === "rate_limited" && blocked.retryAfterSeconds,
    ).toBeGreaterThan(0);
  });

  it("blocks one IP after 20 attempts across different emails", async () => {
    const ip = nextIp();
    for (let i = 0; i < 20; i += 1) {
      await signIn(`unknown${i}@example.test`, "wrong password!!", ip);
    }
    expect(await signIn("admin@example.test", PASSWORD, ip)).toMatchObject({
      reason: "rate_limited",
    });
    expect((await signIn("admin@example.test", PASSWORD, nextIp())).ok).toBe(true);
  });

  it("a successful login clears the per-email failure counter", async () => {
    for (let i = 0; i < 4; i += 1) await signIn("admin@example.test", "wrong password!!");
    expect((await signIn()).ok).toBe(true);
    for (let i = 0; i < 4; i += 1) await signIn("admin@example.test", "wrong password!!");
    expect((await signIn()).ok).toBe(true);
  });

  it("stores rate-limit keys hashed, never as raw email or IP", async () => {
    await signIn("admin@example.test", "wrong password!!", "203.0.113.7");
    const rows = await ownerQuery<{ key: string }>(`select key from auth_rate_limits`);
    expect(rows.length).toBeGreaterThan(0);
    for (const { key } of rows) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("password reset", () => {
  it("sends nothing for unknown or inactive accounts, without signalling it", async () => {
    const mailer = new MemoryMailer();
    await expect(
      requestPasswordReset(db, mailer, { email: "nobody@example.test", ip: nextIp(), appUrl }),
    ).resolves.toBeUndefined();
    await ownerQuery(`update users set status = 'suspended' where id = $1`, [t.users.admin]);
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    expect(mailer.sent).toHaveLength(0);
  });

  it("emails a fragment link and stores only the token hash", async () => {
    const mailer = new MemoryMailer();
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].text).toContain(`${appUrl}/reset-password#token=`);
    const token = tokenFromEmail(mailer);
    const rows = await ownerQuery<{ token_hash: string }>(
      `select token_hash from password_reset_tokens`,
    );
    expect(rows).toEqual([{ token_hash: createHash("sha256").update(token).digest("hex") }]);
  });

  it("resets the password, revokes all sessions, and is single-use", async () => {
    const existing = await signInToken();
    const mailer = new MemoryMailer();
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    const token = tokenFromEmail(mailer);

    expect(await resetPassword(db, { token, newPassword: NEW_PASSWORD, ip: nextIp() })).toEqual({
      ok: true,
      userId: t.users.admin,
    });
    expect(await validateSession(db, existing)).toBeNull();
    expect((await signIn("admin@example.test", PASSWORD)).ok).toBe(false);
    expect((await signIn("admin@example.test", NEW_PASSWORD)).ok).toBe(true);

    // Replay of the same token fails.
    expect(
      await resetPassword(db, { token, newPassword: "another passphrase here", ip: nextIp() }),
    ).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("is single-use even when two submissions race", async () => {
    const mailer = new MemoryMailer();
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    const token = tokenFromEmail(mailer);
    const results = await Promise.all([
      resetPassword(db, { token, newPassword: "first racing passphrase", ip: nextIp() }),
      resetPassword(db, { token, newPassword: "second racing passphrase", ip: nextIp() }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("rejects expired tokens", async () => {
    const mailer = new MemoryMailer();
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    await ownerQuery(`update password_reset_tokens set expires_at = now() - interval '1 second'`);
    expect(
      await resetPassword(db, {
        token: tokenFromEmail(mailer),
        newPassword: NEW_PASSWORD,
        ip: nextIp(),
      }),
    ).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("a newer reset request invalidates the previous link", async () => {
    const mailer = new MemoryMailer();
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    const first = tokenFromEmail(mailer);
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    const second = tokenFromEmail(mailer);
    expect(
      (await resetPassword(db, { token: first, newPassword: NEW_PASSWORD, ip: nextIp() })).ok,
    ).toBe(false);
    expect(
      (await resetPassword(db, { token: second, newPassword: NEW_PASSWORD, ip: nextIp() })).ok,
    ).toBe(true);
  });

  it("enforces the password policy without consuming the token", async () => {
    const mailer = new MemoryMailer();
    await requestPasswordReset(db, mailer, { email: "admin@example.test", ip: nextIp(), appUrl });
    const token = tokenFromEmail(mailer);
    await expect(resetPassword(db, { token, newPassword: "short", ip: nextIp() })).rejects.toThrow(
      AuthValidationError,
    );
    expect((await resetPassword(db, { token, newPassword: NEW_PASSWORD, ip: nextIp() })).ok).toBe(
      true,
    );
  });

  it("rate-limits reset requests per email (3 per hour)", async () => {
    const mailer = new MemoryMailer();
    for (let i = 0; i < 4; i += 1) {
      await requestPasswordReset(db, mailer, {
        email: "admin@example.test",
        ip: nextIp(),
        appUrl,
      });
    }
    expect(mailer.sent).toHaveLength(3);
  });

  it("rate-limits reset submissions per IP", async () => {
    const ip = nextIp();
    for (let i = 0; i < 10; i += 1) {
      expect(
        await resetPassword(db, { token: `guess-${i}`, newPassword: NEW_PASSWORD, ip }),
      ).toMatchObject({
        reason: "invalid_token",
      });
    }
    expect(await resetPassword(db, { token: "guess-x", newPassword: NEW_PASSWORD, ip })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });
});
