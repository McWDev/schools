import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { env } from "@/lib/env";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DatabaseHandle {
  db: Database;
  pool: Pool;
}

export function createDatabase(connectionString: string, options: PoolConfig = {}): DatabaseHandle {
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000, ...options });
  // An idle connection dropped by the server (e.g. Neon scale-to-zero) emits "error" on the pool;
  // without a listener Node would crash the process. The pool discards the broken client itself.
  pool.on("error", (error) => {
    console.error("database pool: idle client error", { code: (error as { code?: string }).code });
  });
  return { db: drizzle(pool, { schema }), pool };
}

// Reuse one pool per process (and across dev hot reloads).
const globalForDb = globalThis as unknown as { __schoolSaasDb?: DatabaseHandle };

/** Runtime database, connected as the restricted app_runtime role. */
export function getDatabase(): Database {
  globalForDb.__schoolSaasDb ??= createDatabase(env().DATABASE_URL);
  return globalForDb.__schoolSaasDb.db;
}
