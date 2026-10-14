import "server-only";

import { parseServerEnv, type ServerEnv } from "./env-schema";

let cached: ServerEnv | undefined;

/**
 * Validated server-side environment. Throws on first access if required
 * variables are missing or malformed, so misconfiguration fails closed.
 */
export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
