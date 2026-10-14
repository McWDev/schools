import { Client } from "pg";

import {
  RESET_SCHOOL_DATA_SQL,
  SYNTHETIC,
  SYNTHETIC_SCHOOL_SQL,
  type SyntheticSchool,
} from "../../scripts/lib/synthetic-school";

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

/** Wipes school data and re-seeds the synthetic school in a single round trip. */
export async function resetSchool(): Promise<SyntheticSchool> {
  await (await ownerClient()).query(`${RESET_SCHOOL_DATA_SQL}\n${SYNTHETIC_SCHOOL_SQL}`);
  return SYNTHETIC;
}
