// First-run setup for a new installation: names the school and creates its first school
// administrator. There is no default password: the account is created without one, and a
// single-use setup link (valid 60 minutes) is printed once to this terminal. Refuses to run if
// a school administrator already exists.
//
//   npm run setup -- --school "Falkaab School" --email admin@example.com --name "Head Teacher"
//                    [--timezone Africa/Mogadishu]
import { parseArgs } from "node:util";

import { loadEnvConfig } from "@next/env";

import { generateToken, hashToken } from "@/server/auth/tokens";

import { withClient } from "./lib/db-admin";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      school: { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
      timezone: { type: "string" },
    },
  });
  const school = values.school?.trim();
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim() || "School Administrator";
  const timezone = values.timezone?.trim() || "UTC";
  const url = process.env.MIGRATION_DATABASE_URL;
  const appUrl = process.env.APP_URL;

  if (!school || school.length < 2) throw new Error('Pass --school "<school name>".');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new Error("Pass --email <address>.");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC") {
    throw new Error(`Unknown timezone "${timezone}". Use an IANA name such as Africa/Mogadishu.`);
  }
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set.");
  if (!appUrl) throw new Error("APP_URL is not set.");

  const token = generateToken();
  await withClient(url, async (client) => {
    await client.query("BEGIN");
    try {
      // Serialize concurrent setup runs so two first administrators can never be created.
      await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
      const existing = await client.query(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.key = 'school_admin' LIMIT 1`,
      );
      if (existing.rowCount) {
        throw new Error("A school administrator already exists. Setup has already been completed.");
      }
      await client.query(`UPDATE school_settings SET name = $1, timezone = $2 WHERE id = 1`, [
        school,
        timezone,
      ]);
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, status, access_scope)
         VALUES ($1, $2, 'invited', 'school') RETURNING id`,
        [email, name],
      );
      const userId = user.rows[0].id;
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE key = 'school_admin'`,
        [userId],
      );
      await client.query(
        `INSERT INTO user_invitations (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '60 minutes')`,
        [userId, hashToken(token)],
      );
      await client.query(
        `INSERT INTO audit_events (actor_user_id, action, target_type, target_id, outcome)
         VALUES ($1, 'school.setup', 'user', $1, 'success')`,
        [userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  console.log(`Setup complete for ${school}. School administrator: ${email}.`);
  console.log("Open this single-use link within 60 minutes to set the password (shown only once):");
  console.log(`${appUrl.replace(/\/$/, "")}/accept-invitation#token=${token}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
