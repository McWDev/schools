import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { SYNTHETIC } from "../../scripts/lib/synthetic-school";

import { resetData, signIn } from "./helpers";

test.beforeEach(resetData);

async function photoFile() {
  const buffer = await sharp({
    create: { width: 300, height: 360, channels: 3, background: "#2f5bd3" },
  })
    .png()
    .toBuffer();
  return { name: "student.png", mimeType: "image/png", buffer };
}

test.describe("student admissions", () => {
  test("branch administrator admits a student with a photo, phone, and guardian", async ({
    page,
  }) => {
    await signIn(page, "main.admin@example.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Students" })
      .click();
    await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Admit student" }).click();

    await page.getByLabel("First name").fill("Sahra");
    await page.getByLabel("Last name").fill("Testcase");
    await page.getByLabel("Date of birth").fill("2019-05-20");
    await page.getByLabel("Gender").selectOption("female");
    await page.getByLabel("Student phone").fill("+252 61 555 0100");
    await page.getByLabel("Student photo").setInputFiles(await photoFile());
    await page.getByLabel("Class and section").selectOption({ label: "Grade 1 A" });
    await page.getByLabel("Guardian name").fill("Faadumo Testcase");
    await page.getByLabel("Relationship").fill("Mother");
    await page.getByRole("button", { name: "Admit student" }).click();

    await expect(page.getByRole("heading", { name: "Sahra Testcase" })).toBeVisible();
    await expect(page.getByText(/Student admitted with number \d{4}-\d{5}\./)).toBeVisible();
    await expect(page.getByText("+252 61 555 0100")).toBeVisible();
    const photo = page.getByRole("img", { name: "Photo of Sahra Testcase" });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
  });

  test("warns about a possible duplicate and admits only after confirmation", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto("/dashboard/students/new");
    await page.getByLabel("First name").fill("Amina");
    await page.getByLabel("Last name").fill("Example");
    await page.getByLabel("Date of birth").fill("2019-03-14");
    await page.getByLabel("Gender").selectOption("female");
    await page.getByLabel("Guardian name").fill("Someone Example");
    await page.getByLabel("Relationship").fill("Aunt");
    await page.getByRole("button", { name: "Admit student" }).click();

    await expect(page.getByText(/Possible duplicate/)).toBeVisible();
    await page.getByLabel("This is a different student. Admit anyway.").check();
    await page.getByRole("button", { name: "Admit student" }).click();
    await expect(page.getByText(/Student admitted with number/)).toBeVisible();
  });

  test("an unsupported photo is refused with a clear message", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto(`/dashboard/students/${SYNTHETIC.students.mainStudent}`);
    await page.getByLabel("Student photo").setInputFiles({
      name: "photo.png",
      mimeType: "image/png",
      buffer: Buffer.from("not really an image"),
    });
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByText(/not a supported image/)).toBeVisible();

    await page.getByLabel("Student photo").setInputFiles(await photoFile());
    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page.getByRole("img", { name: "Photo of Amina Example" })).toBeVisible();
  });

  test("transfers a student between branches and keeps the history", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto(`/dashboard/students/${SYNTHETIC.students.mainStudent}`);
    await page.getByLabel("New branch").selectOption({ label: "North Campus" });
    await page.getByLabel("Reason").fill("Family moved");
    await page.getByRole("button", { name: "Transfer student" }).click();

    await expect(page.getByText("Student transferred to North Campus.")).toBeVisible();
    await expect(page.getByText("Main Campus → North Campus")).toBeVisible();
    await expect(page.getByText(/Family moved/)).toBeVisible();
  });

  test("teachers see their branch's students without sensitive details", async ({ page }) => {
    await signIn(page, "main.teacher@example.test");
    await page.goto("/dashboard/students");
    await expect(page.getByRole("link", { name: /Amina Example/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Yusuf Sample/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Admit student" })).toHaveCount(0);

    await page.getByRole("link", { name: /Amina Example/ }).click();
    await expect(page.getByRole("heading", { name: "Amina Example" })).toBeVisible();
    await expect(page.getByText("12 Example Street")).toHaveCount(0);
    await expect(page.getByText("Example allergy note")).toHaveCount(0);
    await expect(page.getByText(/visible only to authorised staff/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);

    await page.goto(`/dashboard/students/${SYNTHETIC.students.northStudent}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    const photo = await page.request.get(`/api/students/${SYNTHETIC.students.northStudent}/photo`);
    expect(photo.status()).toBe(404);
  });
});
