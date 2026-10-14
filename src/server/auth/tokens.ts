import "server-only";

import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Shown to the user once and never stored. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest. Tokens are high-entropy, so a fast hash is appropriate for lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
