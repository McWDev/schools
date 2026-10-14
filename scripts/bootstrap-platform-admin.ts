// Creates the first platform administrator. There is no default password: the account is
// created without one, and a single-use setup link (valid 60 minutes) is printed once to this
// terminal. Refuses to run if any platform administrator already exists.
//
//   npm run auth:bootstrap-admin -- --email ops@example.com --name "Platform Admin"
import { parseArgs } from "node:util";

import { loadEnvConfig } from "@next/env";

import { generateToken, hashToken } from "@/server/auth/tokens";

import { withClient } from "./lib/db-admin";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim() || "Platform Administrator";
  const url = process.env.MIGRATION_DATABASE_URL;
  const appUrl = process.env.APP_URL;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error("Pass --email <address>.");
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set.");
  if (!appUrl) throw new Error("APP_URL is not set.");

  const token = generateToken();
  await withClient(url, async (client) => {
    await client.query("BEGIN");
    try {
      // Serialize concurrent bootstraps so two admins can never be created by racing.
      await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
      const existing = await client.query(`SELECT 1 FROM users WHERE is_platform_admin LIMIT 1`);
      if (existing.rowCount) {
        throw new Error("A platform administrator already exists. Bootstrap is disabled.");
      }
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, status, is_platform_admin)
         VALUES ($1, $2, 'active', true) RETURNING id`,
        [email, name],
      );
      const userId = user.rows[0].id;
      await client.query(
        `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
         VALUES ($1, $2, now() + interval '60 minutes')`,
        [hashToken(token), userId],
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, outcome)
         VALUES ($1, 'platform.bootstrap_admin', 'user', $1, 'success')`,
        [userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  console.log(`Platform administrator created for ${email}.`);
  console.log("Open this single-use link within 60 minutes to set the password (shown only once):");
  console.log(`${appUrl.replace(/\/$/, "")}/reset-password#token=${token}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
