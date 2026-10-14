import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { SYNTHETIC } from "../../scripts/lib/synthetic-school";

import { alert, latestEmailLink, resetData, signIn } from "./helpers";

test.beforeEach(resetData);

test.describe("user management", () => {
  test("teachers have no Users link and get a no-access page by URL", async ({ page }) => {
    await signIn(page, "main.teacher@example.test");
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }),
    ).toHaveCount(0);
    await page.goto("/dashboard/users");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });

  test("school admin lists and searches all staff", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Users" })
      .click();
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(5); // header + 4 members
    await page.getByRole("searchbox", { name: "Search by name or email" }).fill("north");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("link", { name: /North Teacher/ })).toBeVisible();
  });

  test("branch admin cannot open a school admin's record by URL", async ({ page }) => {
    await signIn(page, "main.admin@example.test");
    await page.goto("/dashboard/users");
    await expect(page.getByRole("link", { name: /^School Admin admin@/ })).toHaveCount(0);
    // Streaming (partial prerendering) sends 200 before the server decides; the record itself
    // must never render. Out-of-scope IDs look exactly like IDs that do not exist.
    await page.goto(`/dashboard/users/${SYNTHETIC.users.admin}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByText("admin@example.test", { exact: true })).toHaveCount(0);
  });

  test("invites a teacher who activates the account and signs in", async ({ page, browser }) => {
    await signIn(page, "admin@example.test");
    await page.goto("/dashboard/users/invite");
    await page.getByLabel("Full name").fill("Invited Teacher");
    await page.getByLabel("Email address").fill("invited.teacher@example.test");
    await page.getByLabel("Specific branches only").check();
    await page.getByLabel(/Main Campus/).check();
    await page.getByRole("checkbox", { name: /^Teacher/ }).check();
    await page.getByRole("button", { name: "Send invitation" }).click();

    await expect(page.getByRole("heading", { name: "Invited Teacher" })).toBeVisible();
    await expect(page.getByText("Invitation pending")).toBeVisible();

    const link = await latestEmailLink("/accept-invitation", "invited.teacher@example.test");
    const invitee = await browser.newPage();
    await invitee.goto(link);
    await expect(invitee).toHaveURL(/\/accept-invitation$/);
    await invitee.getByLabel("Password", { exact: true }).fill("invited teacher pass");
    await invitee.getByLabel("Confirm password").fill("invited teacher pass");
    await invitee.getByRole("button", { name: "Activate account" }).click();
    await expect(invitee.getByText("Your account is active")).toBeVisible();

    await signIn(invitee, "invited.teacher@example.test", "invited teacher pass");
    await expect(invitee.getByRole("heading", { name: "Welcome, Invited Teacher" })).toBeVisible();

    // The same link cannot be used again.
    await invitee.goto(link);
    await invitee.getByLabel("Password", { exact: true }).fill("someone elses pass");
    await invitee.getByLabel("Confirm password").fill("someone elses pass");
    await invitee.getByRole("button", { name: "Activate account" }).click();
    await expect(alert(invitee, "invalid or has expired")).toBeVisible();
  });

  test("changes a member's roles and removes access with confirmation", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto(`/dashboard/users/${SYNTHETIC.users.mainTeacher}`);
    await page.getByRole("checkbox", { name: /^Registrar/ }).check();
    await page.getByRole("button", { name: "Save roles" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Roles updated." })).toBeVisible();

    await page.getByRole("button", { name: "Remove access…" }).click();
    await expect(page.getByText("Remove Main Teacher’s access?")).toBeVisible();
    await page.getByRole("button", { name: "Yes, remove access" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Access removed." })).toBeVisible();
    await page.reload();
    await expect(page.getByText("No access", { exact: true })).toBeVisible();
  });

  test("an administrator cannot change their own access", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto(`/dashboard/users/${SYNTHETIC.users.admin}`);
    await expect(
      page.getByText("You cannot change your own roles, access, or status."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Save roles" })).toHaveCount(0);
  });
});

test.describe("profile photo", () => {
  test("uploads a real image, rejects a disguised file, and keeps photos private", async ({
    page,
    browser,
  }) => {
    const dir = await mkdtemp(join(tmpdir(), "avatar-"));
    const realPng = join(dir, "me.png");
    const fakePng = join(dir, "fake.png");
    await writeFile(
      realPng,
      await sharp({ create: { width: 300, height: 300, channels: 3, background: "#2f5bd3" } })
        .png()
        .toBuffer(),
    );
    await writeFile(fakePng, "<script>alert('not an image')</script>");

    await signIn(page, "main.teacher@example.test");
    await page.goto("/dashboard/profile");

    await page.getByLabel("Choose a photo").setInputFiles(fakePng);
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByText("This file is not a supported image")).toBeVisible();

    await page.getByLabel("Choose a photo").setInputFiles(realPng);
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Your photo was updated." }),
    ).toBeVisible();

    const own = await page.request.get(`/api/avatars/${SYNTHETIC.users.mainTeacher}`);
    expect(own.status()).toBe(200);
    expect(own.headers()["content-type"]).toBe("image/webp");
    expect(own.headers()["x-content-type-options"]).toBe("nosniff");

    // A teacher at another branch cannot fetch this teacher's photo.
    const other = await browser.newPage();
    await signIn(other, "north.teacher@example.test");
    await expect(other.getByRole("heading", { name: /Welcome/ })).toBeVisible();
    const denied = await other.request.get(`/api/avatars/${SYNTHETIC.users.mainTeacher}`);
    expect(denied.status()).toBe(404);

    // Signed-out requests are refused.
    const anonymous = await (
      await browser.newContext()
    ).request.get(`http://localhost:3218/api/avatars/${SYNTHETIC.users.mainTeacher}`);
    expect(anonymous.status()).toBe(401);
  });
});
