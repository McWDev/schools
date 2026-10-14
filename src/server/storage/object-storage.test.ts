import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSafeKey, LocalDiskStorage } from "./object-storage";

let root: string;
let storage: LocalDiskStorage;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "storage-test-"));
  storage = new LocalDiskStorage(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("object storage keys", () => {
  it("accepts server-generated keys", () => {
    expect(() =>
      assertSafeKey("avatars/00000000-0000-4000-8000-000000000101/abc123.webp"),
    ).not.toThrow();
  });

  it("rejects traversal, absolute paths, and user-style filenames", () => {
    for (const key of [
      "../secret.txt",
      "avatars/../../etc/passwd",
      "/etc/passwd",
      "C:\\Windows\\win.ini",
      "avatars/My Photo.png",
      "avatars/x/.webp",
      "avatars//x.webp",
      "avatars/x.webp\u0000.png",
      "",
    ]) {
      expect(() => assertSafeKey(key), key).toThrow("Invalid storage key");
    }
  });

  it("round-trips bytes and reports missing objects as null", async () => {
    await storage.put("avatars/u1/a.webp", Buffer.from("data"), "image/webp");
    expect((await storage.get("avatars/u1/a.webp"))?.toString()).toBe("data");
    await storage.delete("avatars/u1/a.webp");
    expect(await storage.get("avatars/u1/a.webp")).toBeNull();
  });

  it("refuses to read or write outside its root", async () => {
    await expect(storage.get("../outside.webp")).rejects.toThrow("Invalid storage key");
    await expect(storage.put("../outside.webp", Buffer.from("x"), "image/webp")).rejects.toThrow(
      "Invalid storage key",
    );
  });
});
