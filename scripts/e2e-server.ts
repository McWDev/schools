// Prepares the disposable test database and serves the production build for Playwright.
// Requires `npm run build` first. Never point TEST_DATABASE_URL at a real database.
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

import { hashPassword } from "@/server/auth/password";

import { resetDatabase, rotateRuntimePassword, runMigrations, withClient } from "./lib/db-admin";
import { SYNTHETIC_PASSWORD, SYNTHETIC_SCHOOL_SQL } from "./lib/synthetic-school";

const E2E_PORT = 3218;

const E2E_STORAGE_DIR = ".storage-e2e";

async function main(): Promise<void> {
  // Load .env.test.local (TEST_DATABASE_URL), not the development .env.local.
  Object.assign(process.env, { NODE_ENV: "test" });
  loadEnvConfig(process.cwd());
  const ownerUrl = process.env.TEST_DATABASE_URL;
  if (!ownerUrl) throw new Error("TEST_DATABASE_URL is required for end-to-end tests.");

  await resetDatabase(ownerUrl);
  await runMigrations(ownerUrl);
  const passwordHash = await hashPassword(SYNTHETIC_PASSWORD);
  await withClient(ownerUrl, async (client) => {
    await client.query(SYNTHETIC_SCHOOL_SQL);
    await client.query(`UPDATE users SET password_hash = $1`, [passwordHash]);
  });
  const runtimeUrl = await rotateRuntimePassword(ownerUrl);
  await rm(".outbox", { recursive: true, force: true });
  // A separate folder: wiping it must never delete the dev server's uploads (logo, photos).
  await rm(E2E_STORAGE_DIR, { recursive: true, force: true });

  const server = spawn("npx", ["next", "start", "-p", String(E2E_PORT)], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: runtimeUrl,
      APP_URL: `http://localhost:${E2E_PORT}`,
      EMAIL_TRANSPORT: "outbox",
      STORAGE_DRIVER: "local",
      STORAGE_DIR: E2E_STORAGE_DIR,
    },
  });
  const stop = () => server.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
