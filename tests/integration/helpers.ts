import { Client } from "pg";

import {
  SYNTHETIC_TENANTS_SQL,
  SYNTHETIC,
  type SyntheticTenants,
} from "../../scripts/lib/synthetic-tenants";

export function ownerUrl(): string {
  const url = process.env.TEST_OWNER_DATABASE_URL;
  if (!url) throw new Error("Integration global setup did not run");
  return url;
}

export function runtimeUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Integration global setup did not run");
  return url;
}

// One owner connection per test file; it bypasses RLS and is used only to arrange and inspect data.
let owner: Client | undefined;

async function ownerClient(): Promise<Client> {
  if (!owner) {
    const client = new Client({ connectionString: ownerUrl() });
    // A dropped connection is replaced on the next query instead of crashing the worker.
    client.on("error", () => {
      if (owner === client) owner = undefined;
    });
    await client.connect();
    owner = client;
  }
  return owner;
}

export async function closeOwner(): Promise<void> {
  await owner?.end();
  owner = undefined;
}

export async function ownerQuery<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  return (await (await ownerClient()).query<T>(text, values)).rows;
}

/** Wipes tenant data and re-seeds the synthetic schools in a single round trip. */
export async function resetTenants(): Promise<SyntheticTenants> {
  await (
    await ownerClient()
  ).query(`
    TRUNCATE auth_rate_limits, password_reset_tokens, sessions, audit_events, membership_branches,
      school_memberships, branches, users, schools CASCADE;
    ${SYNTHETIC_TENANTS_SQL}
  `);
  return SYNTHETIC;
}
