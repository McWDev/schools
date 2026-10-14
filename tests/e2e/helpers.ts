import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadEnvConfig } from "@next/env";
import { hash } from "@node-rs/argon2";
import type { Page } from "@playwright/test";
import { Client } from "pg";

import {
  RESET_SCHOOL_DATA_SQL,
  SYNTHETIC_PASSWORD,
  SYNTHETIC_SCHOOL_SQL,
} from "../../scripts/lib/synthetic-school";

/** Submit the sign-in form without waiting for the outcome (for failure cases). */
export async function attemptSignIn(
  page: Page,
  email: string,
  password = SYNTHETIC_PASSWORD,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Sign in and wait until the dashboard has loaded, so the session cookie is set. */
export async function signIn(
  page: Page,
  email: string,
  password = SYNTHETIC_PASSWORD,
): Promise<void> {
  await attemptSignIn(page, email, password);
  await page.waitForURL(/\/dashboard$/);
}

/** Our form alerts, excluding the route announcer Next.js renders with role="alert". */
export const alert = (page: Page, text: string) =>
  page.getByRole("alert").filter({ hasText: text });

/** Newest link to `path` (e.g. "/reset-password") in an email in the dev outbox for `to`. */
export async function latestEmailLink(path: string, to?: string): Promise<string> {
  const pattern = new RegExp(String.raw`(http\S+${path}#token=[A-Za-z0-9_-]+)`);
  // Emails are sent after the response (and over a remote database locally), so allow 30 s.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const files = (await readdir(".outbox").catch(() => [])).sort().reverse();
    for (const file of files) {
      const message = JSON.parse(await readFile(join(".outbox", file), "utf8"));
      if (to && message.to !== to) continue;
      const link = pattern.exec(message.text)?.[1];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email with a ${path} link arrived in .outbox`);
}

let passwordHash: Promise<string> | undefined;

/**
 * Restore the synthetic school (and clear sessions, rate limits, invitations) so every test
 * starts from the same state regardless of order. Test database only.
 */
export async function resetData(): Promise<void> {
  Object.assign(process.env, { NODE_ENV: "test" });
  loadEnvConfig(process.cwd());
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  passwordHash ??= hash(SYNTHETIC_PASSWORD, {
    algorithm: 2,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // The app server may still be finishing the previous test's requests (e.g. work scheduled
    // with after()), which can deadlock with TRUNCATE. Retry the whole reset a few times.
    for (let attempt = 1; ; attempt += 1) {
      try {
        await client.query(`
          BEGIN;
          SET LOCAL lock_timeout = '5s';
          ${RESET_SCHOOL_DATA_SQL}
          ${SYNTHETIC_SCHOOL_SQL}
          COMMIT;
        `);
        break;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        const code = (error as { code?: string }).code;
        const retryable = code === "40P01" || code === "55P03"; // deadlock, lock timeout
        if (!retryable || attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    await client.query(`UPDATE users SET password_hash = $1`, [await passwordHash]);
  } finally {
    await client.end();
  }
}

/** Open the account menu in the top bar and sign out. */
export async function signOut(page: Page): Promise<void> {
  await page.getByLabel("Account menu").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login$/);
}

/** Labels of the links in the main navigation. */
export async function navLabels(page: Page): Promise<string[]> {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link").allInnerTexts();
}
