import { expect, test } from "@playwright/test";

import { SYNTHETIC_PASSWORD } from "../../scripts/lib/synthetic-tenants";

import { alert, attemptSignIn, latestEmailLink, resetData, signIn } from "./helpers";

test.beforeEach(resetData);

test.describe("protected routes", () => {
  test("redirects signed-out visitors from the dashboard to sign in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("data endpoint returns 401 without a session", async ({ request }) => {
    const response = await request.get("/api/me");
    expect(response.status()).toBe(401);
  });

  test("a forged session cookie is rejected server-side", async ({ page, context, request }) => {
    await context.addCookies([
      { name: "session", value: "forged-token-value-1234567890", url: "http://localhost:3218" },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    const api = await request.get("/api/me", {
      headers: { cookie: "session=forged-token-value-1234567890" },
    });
    expect(api.status()).toBe(401);
  });
});

test.describe("sign in and out", () => {
  test("shows a generic error for wrong credentials", async ({ page }) => {
    await attemptSignIn(page, "admin.a@example.test", "definitely the wrong password");
    await expect(alert(page, "The email or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    // The email is kept so the user only re-types the password; the password is never echoed.
    await expect(page.getByLabel("Email address")).toHaveValue("admin.a@example.test");
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  });

  test("signs in, shows the dashboard, then signs out", async ({ page, context }) => {
    await signIn(page, "admin.a@example.test", SYNTHETIC_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Welcome, Admin A" })).toBeVisible();
    await expect(page.getByText("Current school: Example Academy A")).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === "session");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

    const me = await page.request.get("/api/me");
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ user: { displayName: "Admin A" } });

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    // The revoked session no longer works even if the old cookie were replayed.
    const replay = await page.request.get("/api/me", {
      headers: { cookie: `session=${cookie!.value}` },
    });
    expect(replay.status()).toBe(401);
  });

  test("multi-school users choose a school explicitly", async ({ page }) => {
    await signIn(page, "multi@example.test", SYNTHETIC_PASSWORD);
    await expect(page.getByText("No school selected")).toBeVisible();
    await page
      .getByRole("listitem")
      .filter({ hasText: "Example Academy B" })
      .getByRole("button", { name: "Switch to this school" })
      .click();
    await expect(page.getByText("Current school: Example Academy B")).toBeVisible();
  });
});

test.describe("password reset", () => {
  test("resets the password through the emailed link", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill("teacher.a1@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists for that email");

    const link = await latestEmailLink("/reset-password", "teacher.a1@example.test");
    await page.goto(link);
    // The token is removed from the address bar as soon as the page reads it.
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("New password", { exact: true }).fill("teacher picked a new passphrase");
    await page.getByLabel("Confirm new password").fill("teacher picked a new passphrase");
    await page.getByRole("button", { name: "Save new password" }).click();

    await expect(page).toHaveURL(/\/login\?reset=1$/);
    await expect(page.getByRole("status")).toContainText("Your password was changed");
    await signIn(page, "teacher.a1@example.test", "teacher picked a new passphrase");
    await expect(page.getByRole("heading", { name: "Welcome, Teacher A1" })).toBeVisible();

    // Replaying the same link fails.
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("yet another passphrase 123");
    await page.getByLabel("Confirm new password").fill("yet another passphrase 123");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(alert(page, "invalid or has expired")).toBeVisible();
  });

  test("the forgot-password response is identical for unknown emails", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill("nobody@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists for that email");
  });
});
