// Owner-level database utilities for scripts and tests. Never import from application code.
import { randomBytes } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

export const RUNTIME_ROLE = "app_runtime";

export async function withClient<T>(url: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export async function runMigrations(ownerUrl: string): Promise<void> {
  await withClient(ownerUrl, async (client) => {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  });
}

/** Drops every application schema. Only for disposable test databases. */
export async function resetDatabase(ownerUrl: string): Promise<void> {
  await withClient(ownerUrl, async (client) => {
    // Sessions left behind by an interrupted test run can hold locks and block the drop below.
    await client.query(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid();
    `);
    await client.query(`
      SET lock_timeout = '15s';
      DROP SCHEMA IF EXISTS drizzle CASCADE;
      DROP SCHEMA IF EXISTS app CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
    `);
  });
}

/** Enables login for app_runtime with a new random password and returns its connection URL. */
export async function rotateRuntimePassword(ownerUrl: string): Promise<string> {
  const password = randomBytes(24).toString("base64url");
  await withClient(ownerUrl, async (client) => {
    // Identifiers cannot be parameterized; the role name is a constant and the password is
    // base64url, so neither can break out of the quoted literal.
    await client.query(`ALTER ROLE ${RUNTIME_ROLE} WITH LOGIN PASSWORD '${password}'`);
  });
  const url = new URL(ownerUrl);
  url.username = RUNTIME_ROLE;
  url.password = password;
  return url.toString();
}
