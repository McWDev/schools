import { describe, expect, it } from "vitest";

import { hashPassword, passwordSchema, verifyAgainstDummy, verifyPassword } from "./password";
import { generateToken, hashToken } from "./tokens";

describe("tokens", () => {
  it("generates unique 256-bit URL-safe tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashes deterministically to 64 hex characters", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const hash = await hashPassword("a long enough passphrase");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "a long enough passphrase")).toBe(true);
    expect(await verifyPassword(hash, "a long enough passphrasE")).toBe(false);
  });

  it("treats a malformed stored hash as a failed verification", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("dummy verification always fails", async () => {
    expect(await verifyAgainstDummy("anything at all")).toBe(false);
  });

  it("enforces length limits only", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("twelve chars").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
  });
});
