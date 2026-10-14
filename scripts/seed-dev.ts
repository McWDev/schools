import { loadEnvConfig } from "@next/env";

import { withClient } from "./lib/db-admin";
import { insertSyntheticTenants } from "./lib/synthetic-tenants";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("MIGRATION_DATABASE_URL is not set.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed synthetic data with NODE_ENV=production.");
    process.exit(1);
  }

  await withClient(url, async (client) => {
    const existing = await client.query(`SELECT 1 FROM schools WHERE slug = 'example-academy-a'`);
    if (existing.rowCount) {
      console.log("Synthetic tenants already present; nothing to do.");
      return;
    }
    await client.query("BEGIN");
    try {
      await insertSyntheticTenants(client);
      await client.query("COMMIT");
      console.log("Seeded synthetic School A (2 branches) and School B (1 branch).");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
