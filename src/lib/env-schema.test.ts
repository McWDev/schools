import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env-schema";

const valid = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:secret@host.neon.tech/neondb?sslmode=require",
};

describe("parseServerEnv", () => {
  it("accepts a valid environment and applies defaults", () => {
    const env = parseServerEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.APP_URL).toBe("http://localhost:3217");
  });

  it("fails closed when DATABASE_URL is missing", () => {
    expect(() => parseServerEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
  });

  it("rejects non-postgres URLs", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "https://example.com" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("never includes secret values in the error message", () => {
    const secret = "postgresql://user:supersecret@";
    try {
      parseServerEnv({ ...valid, DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("supersecret");
    }
  });
});

describe("EMAIL_TRANSPORT", () => {
  it("defaults to the local outbox outside production and to disabled in production", () => {
    expect(parseServerEnv(valid).EMAIL_TRANSPORT).toBe("outbox");
    expect(parseServerEnv({ ...valid, NODE_ENV: "production" }).EMAIL_TRANSPORT).toBe("disabled");
    expect(
      parseServerEnv({ ...valid, NODE_ENV: "production", EMAIL_TRANSPORT: "outbox" })
        .EMAIL_TRANSPORT,
    ).toBe("outbox");
  });
});
