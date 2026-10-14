import { loadEnvConfig } from "@next/env";

import { hashPassword } from "@/server/auth/password";

import { withClient } from "./lib/db-admin";
import {
  insertSyntheticTenants,
  SYNTHETIC_ACCESS_SQL,
  SYNTHETIC_PASSWORD,
  SYNTHETIC_PLATFORM_ADMIN_SQL,
} from "./lib/synthetic-tenants";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed synthetic data with NODE_ENV=production.");
  }

  await withClient(url, async (client) => {
    const existing = await client.query(`SELECT 1 FROM schools WHERE slug = 'example-academy-a'`);
    await client.query("BEGIN");
    try {
      if (existing.rowCount) {
        console.log("Synthetic tenants already present; refreshing roles and access.");
        await client.query(SYNTHETIC_ACCESS_SQL);
        await client.query(SYNTHETIC_PLATFORM_ADMIN_SQL);
      } else {
        await insertSyntheticTenants(client);
        console.log("Seeded synthetic School A (2 branches) and School B (1 branch).");
      }
      // Synthetic accounts only (the reserved .test domain); real users are never touched.
      const updated = await client.query(
        `UPDATE users SET password_hash = $1
         WHERE email LIKE '%@example.test' AND password_hash IS NULL`,
        [await hashPassword(SYNTHETIC_PASSWORD)],
      );
      if (updated.rowCount) {
        console.log(`Set the development password on ${updated.rowCount} synthetic account(s).`);
      }
      await client.query("COMMIT");
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
