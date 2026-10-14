import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { navLabels, resetData, signIn } from "./helpers";

test.beforeEach(resetData);

test.describe("role-aware navigation", () => {
  const cases: [string, string, string[]][] = [
    ["school admin", "admin.a@example.test", ["Dashboard", "Users", "My profile"]],
    ["branch admin", "branch.admin.a1@example.test", ["Dashboard", "Users", "My profile"]],
    ["teacher", "teacher.a1@example.test", ["Dashboard", "My profile"]],
    ["platform admin", "platform@example.test", ["Dashboard", "Platform overview", "My profile"]],
  ];
  for (const [role, email, expected] of cases) {
    test(`${role} sees the right navigation`, async ({ page }) => {
      await signIn(page, email);
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      expect(await navLabels(page)).toEqual(expected);
    });
  }

  test("marks the current page in the navigation", async ({ page }) => {
    await signIn(page, "admin.a@example.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Users" })
      .click();
    await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("platform admin sees aggregate school counts only", async ({ page }) => {
    await signIn(page, "platform@example.test");
    await page.getByRole("link", { name: "Platform overview" }).click();
    await expect(page.getByRole("heading", { name: "Schools by status" })).toBeVisible();
    await expect(page.getByText("Example Academy A")).toHaveCount(0);
  });

  test("non-platform users get no access on the platform page", async ({ page }) => {
    await signIn(page, "admin.a@example.test");
    await page.goto("/dashboard/platform");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });
});

test.describe("branch context", () => {
  test("school admin switches between branches and back", async ({ page }) => {
    await signIn(page, "admin.a@example.test");
    await expect(page.getByText("Current school: Example Academy A · All branches")).toBeVisible();
    await expect(page.getByText("Active branches")).toBeVisible();

    await page.getByLabel(/^Branch: All branches/).click();
    await page.getByRole("button", { name: /A North Campus/ }).click();
    await expect(
      page.getByText("Current school: Example Academy A · A North Campus"),
    ).toBeVisible();
    await expect(page.getByText("Selected branch")).toBeVisible();

    await page.getByLabel(/^Branch: A North Campus/).click();
    await page.getByRole("button", { name: /^All branches/ }).click();
    await expect(page.getByText("Current school: Example Academy A · All branches")).toBeVisible();
  });

  test("branch user can only choose an assigned branch", async ({ page }) => {
    await signIn(page, "teacher.a1@example.test");
    await page.getByLabel(/^Branch:/).click();
    await expect(page.getByRole("button", { name: /A Main Campus/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /A North Campus/ })).toHaveCount(0);
  });

  test("teacher dashboard shows their access and no staff figures", async ({ page }) => {
    await signIn(page, "teacher.a1@example.test");
    await expect(page.getByText("Your access")).toBeVisible();
    await expect(page.getByText("Teacher", { exact: true })).toBeVisible();
    await expect(page.getByText("Staff with access")).toHaveCount(0);
    await expect(page.getByText("Recent activity")).toHaveCount(0);
  });
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("responsive layout", () => {
  test("mobile: drawer navigation, no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "admin.a@example.test");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("button", { name: "Close navigation" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    await page.getByRole("button", { name: "Open navigation" }).click();
    await drawer.getByRole("link", { name: "Users" }).click();
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(drawer).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  for (const [name, width, height] of [
    ["tablet", 820, 1180],
    ["desktop", 1440, 900],
  ] as const) {
    test(`${name}: core pages fit the viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await signIn(page, "admin.a@example.test");
      for (const path of ["/dashboard", "/dashboard/users", "/dashboard/profile"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoHorizontalOverflow(page);
      }
    });
  }
});

test.describe("accessibility", () => {
  async function expectNoSeriousViolations(page: Page) {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    expect(serious).toEqual([]);
  }

  test("sign-in page has no serious accessibility violations", async ({ page }) => {
    await page.goto("/login");
    await expectNoSeriousViolations(page);
  });

  test("signed-in pages have no serious accessibility violations", async ({ page }) => {
    await signIn(page, "admin.a@example.test");
    for (const path of [
      "/dashboard",
      "/dashboard/users",
      "/dashboard/users/invite",
      "/dashboard/profile",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });

  test("keyboard users can skip straight to the content", async ({ page }) => {
    await signIn(page, "admin.a@example.test");
    // A fresh page load, as a keyboard user arrives: the first Tab reaches the skip link.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});
