import { expect, test } from "@playwright/test";

import { SYNTHETIC } from "../../scripts/lib/synthetic-school";

import { resetData, signIn } from "./helpers";

test.beforeEach(resetData);

test.describe("academic structure", () => {
  test("administrator creates a year and adds terms inside it", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Academic years" })
      .click();
    await expect(page.getByRole("heading", { name: "Academic years" })).toBeVisible();
    await expect(page.getByRole("link", { name: /2026-2027/ })).toContainText("Current");

    await page.getByRole("link", { name: "New academic year" }).click();
    await page.getByLabel("Year name").fill("2027-2028");
    await page.getByLabel("Starts on").fill("2027-09-01");
    await page.getByLabel("Ends on").fill("2028-06-30");
    await page.getByRole("button", { name: "Create academic year" }).click();
    await expect(page.getByRole("heading", { name: "2027-2028" })).toBeVisible();
    await expect(page.getByText("Academic year created.")).toBeVisible();

    // A term outside the year is refused with a field-level message.
    await page.getByLabel("Term name").fill("Semester 1");
    await page.getByLabel("Term starts on").fill("2027-08-01");
    await page.getByLabel("Term ends on").fill("2028-01-31");
    await page.getByRole("button", { name: "Add term" }).click();
    await expect(page.getByText("Term dates must fall within the academic year.")).toBeVisible();

    await page.getByLabel("Term starts on").fill("2027-09-01");
    await page.getByRole("button", { name: "Add term" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Term added." })).toBeVisible();
    await expect(page.locator("#main").getByText("Semester 1")).toBeVisible();
  });

  test("administrator adds grade levels; duplicate codes are explained", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page.goto("/dashboard/academics/grades");
    await page.getByLabel("Grade name").fill("Grade 3");
    await page.getByLabel("Code").fill("g3");
    await page.getByRole("button", { name: "Add grade level" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Grade level added." })).toBeVisible();
    await expect(page.getByRole("cell", { name: "G3" })).toBeVisible();

    await page.getByLabel("Grade name").fill("Grade One");
    await page.getByLabel("Code").fill("G1");
    await page.getByRole("button", { name: "Add grade level" }).click();
    await expect(page.getByText("Another grade level already uses this code.")).toBeVisible();
  });

  test("branch administrator creates a class with sections and archives one", async ({ page }) => {
    await signIn(page, "main.admin@example.test");
    await page.goto("/dashboard/academics/classes");
    await expect(page.getByRole("link", { name: /Grade 1/ })).toContainText("Sections A");

    await page.getByLabel("Grade level").selectOption({ label: "Grade 2" });
    await page.getByRole("button", { name: "Create class" }).click();
    await expect(page.getByRole("heading", { name: "Grade 2" })).toBeVisible();
    await expect(page.getByText("Class created.")).toBeVisible();

    await page.getByLabel("Section name").fill("A");
    await page.getByLabel("Capacity").fill("35");
    await page.getByLabel("Room").fill("Room 201");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByText("35 seats · Room 201")).toBeVisible();

    await page.getByLabel("Section name").fill("A");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByText("This class already has a section with this name.")).toBeVisible();

    await page.getByRole("button", { name: "Archive Section A" }).click();
    await expect(page.getByText(/stay in history/)).toBeVisible();
    await page.getByRole("button", { name: "Yes, archive Section A" }).click();
    await expect(page.getByRole("button", { name: "Restore Section A" })).toBeVisible();
  });

  test("teachers read the structure but cannot change it", async ({ page }) => {
    await signIn(page, "main.teacher@example.test");
    await page.goto("/dashboard/academics/years");
    await expect(page.getByRole("link", { name: /2026-2027/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "New academic year" })).toHaveCount(0);

    await page.goto("/dashboard/academics/classes");
    await expect(page.getByRole("link", { name: /Grade 1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create class" })).toHaveCount(0);

    await page.goto(`/dashboard/academics/classes/${SYNTHETIC.classes.mainGrade1}`);
    await expect(page.getByText("Room 101")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add section" })).toHaveCount(0);

    await page.goto("/dashboard/academics/years/new");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });

  test("a class in another branch looks like it does not exist", async ({ page }) => {
    await signIn(page, "north.teacher@example.test");
    await page.goto("/dashboard/academics/classes");
    await expect(page.getByText("No classes in 2026-2027 yet")).toBeVisible();
    await page.goto(`/dashboard/academics/classes/${SYNTHETIC.classes.mainGrade1}`);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  });
});
