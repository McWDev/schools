import { expect, test } from "@playwright/test";

import { SYNTHETIC } from "../../scripts/lib/synthetic-school";

import { resetData, signIn } from "./helpers";

test.beforeEach(resetData);

test.describe("branch management", () => {
  test("administrator opens a branch in a new area and it appears in the selector", async ({
    page,
  }) => {
    await signIn(page, "admin@example.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Branches" })
      .click();
    await expect(page.getByRole("heading", { name: "Branches" })).toBeVisible();
    await page.getByRole("link", { name: "Open branch" }).click();

    await page.getByLabel("Branch name").fill("East Campus");
    await page.getByLabel("Code").fill("east");
    await page.getByLabel("Area").fill("Hodan District");
    await page.getByRole("button", { name: "Open branch" }).click();

    await expect(page.getByRole("heading", { name: "East Campus" })).toBeVisible();
    await expect(page.locator("#main").getByText("Hodan District · EAST")).toBeVisible();
    await expect(page.getByText("Branch opened.")).toBeVisible();

    await page.getByLabel(/^Branch:/).click();
    await expect(page.getByRole("button", { name: /East Campus/ })).toBeVisible();
  });

  test("shows a clear error for a duplicate branch code", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto("/dashboard/branches/new");
    await page.getByLabel("Branch name").fill("Main Again");
    await page.getByLabel("Code").fill("MAIN");
    await page.getByRole("button", { name: "Open branch" }).click();
    await expect(page.getByText("Another branch already uses this code.")).toBeVisible();
    // What was typed is kept so it can be corrected.
    await expect(page.getByLabel("Branch name")).toHaveValue("Main Again");
  });

  test("edits a branch and deactivates it with confirmation, keeping it listed", async ({
    page,
  }) => {
    await signIn(page, "admin@example.test");
    await page.goto(`/dashboard/branches/${SYNTHETIC.branches.north}`);
    await page.getByLabel("Area").fill("North District");
    await page.getByRole("button", { name: "Save branch details" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Branch details saved." }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Deactivate branch…" }).click();
    await expect(page.getByText(/records, and history are kept/)).toBeVisible();
    await page.getByRole("button", { name: "Yes, deactivate branch" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Branch deactivated." })).toBeVisible();

    await page.goto("/dashboard/branches");
    const card = page.getByRole("link", { name: /North Campus/ });
    await expect(card).toContainText("Inactive");
    await page.getByLabel(/^Branch:/).click();
    await expect(page.getByRole("button", { name: /North Campus/ })).toHaveCount(0);
  });

  test("a teacher sees only their own branch and cannot manage it", async ({ page }) => {
    await signIn(page, "main.teacher@example.test");
    await page.goto("/dashboard/branches");
    await expect(page.getByRole("link", { name: /Main Campus/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /North Campus/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open branch" })).toHaveCount(0);

    await page.goto(`/dashboard/branches/${SYNTHETIC.branches.main}`);
    await expect(page.getByRole("button", { name: "Save branch details" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Deactivate/ })).toHaveCount(0);

    // Another branch by URL looks exactly like a branch that does not exist.
    await page.goto(`/dashboard/branches/${SYNTHETIC.branches.north}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });

  test("a branch administrator cannot open branches", async ({ page }) => {
    await signIn(page, "main.admin@example.test");
    await page.goto("/dashboard/branches/new");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });
});
