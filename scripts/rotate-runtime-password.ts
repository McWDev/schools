// Sets a new random password for app_runtime on the database behind MIGRATION_DATABASE_URL and
// prints the runtime connection string to store as DATABASE_URL (local .env.local or the host's
// secret manager). Run once per environment, and again whenever the secret must be rotated.
import { loadEnvConfig } from "@next/env";

import { rotateRuntimePassword } from "./lib/db-admin";

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("MIGRATION_DATABASE_URL is not set.");
    process.exit(1);
  }

  const runtimeUrl = await rotateRuntimePassword(url);
  const pooled = new URL(runtimeUrl);
  // Neon: the runtime should use the pooled endpoint.
  if (pooled.hostname.endsWith(".neon.tech") && !pooled.hostname.includes("-pooler")) {
    pooled.hostname = pooled.hostname.replace(/^([^.]+)/, "$1-pooler");
  }
  console.log(pooled.toString());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
