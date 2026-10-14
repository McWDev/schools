import { loadEnvConfig } from "@next/env";

import { resetDatabase, rotateRuntimePassword, runMigrations } from "../../scripts/lib/db-admin";

/**
 * Prepares a disposable test database: wipes it, applies every migration from scratch (proving
 * they work on a clean database), and points DATABASE_URL at the restricted runtime role.
 */
export default async function setup(): Promise<void> {
  loadEnvConfig(process.cwd());
  const ownerUrl = process.env.TEST_DATABASE_URL;
  if (!ownerUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests (see .env.example).");
  }
  for (const other of [process.env.DATABASE_URL, process.env.MIGRATION_DATABASE_URL]) {
    if (other && new URL(other).host === new URL(ownerUrl).host) {
      throw new Error("TEST_DATABASE_URL must point at a separate, disposable database.");
    }
  }

  await resetDatabase(ownerUrl);
  await runMigrations(ownerUrl);
  process.env.TEST_OWNER_DATABASE_URL = ownerUrl;
  process.env.DATABASE_URL = await rotateRuntimePassword(ownerUrl);
}
