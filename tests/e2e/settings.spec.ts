import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { navLabels, resetData, signIn, signOut } from "./helpers";

test.beforeEach(resetData);

test.describe("school settings", () => {
  test("administrator renames the school and sets its timezone", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "School settings" })
      .click();
    await expect(page.getByRole("heading", { name: "School settings" })).toBeVisible();

    await page.getByLabel("School name").fill("Falkaab Model School");
    await page.getByLabel("Short name").fill("FMS");
    await page.getByLabel("Timezone").selectOption("Africa/Mogadishu");
    await page.getByRole("button", { name: "Save school profile" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "School profile saved." }),
    ).toBeVisible();

    // The new name appears in the shell and on the sign-in page.
    await page.goto("/dashboard");
    await expect(page.getByRole("complementary").getByText("Falkaab Model School")).toBeVisible();
    await signOut(page);
    await expect(page.getByText("Falkaab Model School").first()).toBeVisible();
  });

  test("validation errors are shown next to the field", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto("/dashboard/settings");
    await page.getByLabel("School name").fill("X");
    await page.getByLabel("School email").fill("not-an-email");
    await page.getByRole("button", { name: "Save school profile" }).click();
    await expect(page.getByText("Enter the school name.")).toBeVisible();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });

  test("uploaded logo appears on the sign-in page; disguised files are rejected", async ({
    page,
  }) => {
    const dir = await mkdtemp(join(tmpdir(), "logo-"));
    const logo = join(dir, "logo.png");
    const fake = join(dir, "fake.png");
    await writeFile(
      logo,
      await sharp({ create: { width: 400, height: 400, channels: 4, background: "#0d9488" } })
        .png()
        .toBuffer(),
    );
    await writeFile(fake, "<svg onload=alert(1)></svg>");

    await signIn(page, "admin@example.test");
    await page.goto("/dashboard/settings");
    await page.getByLabel("Choose a logo").setInputFiles(fake);
    await page.getByRole("button", { name: "Upload logo" }).click();
    await expect(page.getByText("This file is not a supported image")).toBeVisible();

    await page.getByLabel("Choose a logo").setInputFiles(logo);
    await page.getByRole("button", { name: "Upload logo" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Logo updated." })).toBeVisible();

    const response = await page.request.get("/api/school/logo");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");

    await signOut(page);
    await expect(page.getByRole("img", { name: "Example Academy logo" }).first()).toBeVisible();
  });

  test("teachers and branch admins have no settings access", async ({ page }) => {
    for (const email of ["main.teacher@example.test", "main.admin@example.test"]) {
      await signIn(page, email);
      expect(await navLabels(page)).not.toContain("School settings");
      await page.goto("/dashboard/settings");
      await expect(
        page.getByRole("heading", { name: "You don't have access to this page" }),
      ).toBeVisible();
      await signOut(page);
    }
  });
});
