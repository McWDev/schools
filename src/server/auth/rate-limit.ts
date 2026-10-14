import "server-only";

import { sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";

import { hashToken } from "./tokens";

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Keys may contain emails or IPs, so only a hash is stored. */
function storageKey(key: string): string {
  return hashToken(`rate-limit:${key}`);
}

/**
 * Fixed-window counter, atomic in a single statement and shared across app instances because it
 * lives in Postgres. Each call consumes one attempt.
 */
export async function consumeRateLimit(
  db: Database,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const result = await db.execute<{ count: number; retry_after: number }>(sql`
    insert into auth_rate_limits (key, count, reset_at)
    values (${storageKey(key)}, 1, now() + make_interval(secs => ${rule.windowSeconds}))
    on conflict (key) do update set
      count = case when auth_rate_limits.reset_at <= now() then 1 else auth_rate_limits.count + 1 end,
      reset_at = case when auth_rate_limits.reset_at <= now()
        then now() + make_interval(secs => ${rule.windowSeconds}) else auth_rate_limits.reset_at end
    returning count, ceil(extract(epoch from (reset_at - now())))::int as retry_after
  `);
  const row = result.rows[0];
  return { allowed: row.count <= rule.limit, retryAfterSeconds: Math.max(row.retry_after, 1) };
}

export async function clearRateLimit(db: Database, key: string): Promise<void> {
  await db.execute(sql`delete from auth_rate_limits where key = ${storageKey(key)}`);
}
