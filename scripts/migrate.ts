import { loadEnvConfig } from "@next/env";

import { runMigrations } from "./lib/db-admin";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("MIGRATION_DATABASE_URL is not set.");
    process.exit(1);
  }

  await runMigrations(url);
  console.log(`Migrations applied to ${new URL(url).host}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
