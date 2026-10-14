import { loadEnvConfig } from "@next/env";

import { hashPassword } from "@/server/auth/password";

import { withClient } from "./lib/db-admin";
import { insertSyntheticSchool, SYNTHETIC_PASSWORD } from "./lib/synthetic-school";

loadEnvConfig(process.cwd());

/** Development only: fill an empty database with the synthetic example school. */
async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set.");
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed synthetic data with NODE_ENV=production.");
  }

  await withClient(url, async (client) => {
    const existing = await client.query(`SELECT count(*)::int AS n FROM users`);
    if (existing.rows[0].n > 0) {
      console.log("The database already has users; synthetic data was not added.");
      return;
    }
    await client.query("BEGIN");
    try {
      await insertSyntheticSchool(client);
      await client.query(`UPDATE users SET password_hash = $1 WHERE email LIKE '%@example.test'`, [
        await hashPassword(SYNTHETIC_PASSWORD),
      ]);
      await client.query("COMMIT");
      console.log("Seeded Example Academy: 2 branches, 4 synthetic staff accounts.");
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
