import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { navLabels, resetData, signIn } from "./helpers";

test.beforeEach(resetData);

test.describe("role-aware navigation", () => {
  const cases: [string, string, string[]][] = [
    ["school admin", "admin@example.test", ["Dashboard", "Users", "School settings", "My profile"]],
    ["branch admin", "main.admin@example.test", ["Dashboard", "Users", "My profile"]],
    ["teacher", "main.teacher@example.test", ["Dashboard", "My profile"]],
  ];
  for (const [role, email, expected] of cases) {
    test(`${role} sees the right navigation`, async ({ page }) => {
      await signIn(page, email);
      await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
      expect(await navLabels(page)).toEqual(expected);
    });
  }

  test("marks the current page in the navigation", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Users" })
      .click();
    await expect(page.getByRole("link", { name: "Users", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("branch context", () => {
  test("school admin switches between branches and back", async ({ page }) => {
    await signIn(page, "admin@example.test");
    await expect(page.getByText("Example Academy · All branches")).toBeVisible();
    await expect(page.getByText("Active branches")).toBeVisible();

    await page.getByLabel(/^Branch: All branches/).click();
    await page.getByRole("button", { name: /North Campus/ }).click();
    await expect(page.getByText("Example Academy · North Campus")).toBeVisible();
    await expect(page.getByText("Selected branch")).toBeVisible();

    await page.getByLabel(/^Branch: North Campus/).click();
    await page.getByRole("button", { name: /^All branches/ }).click();
    await expect(page.getByText("Example Academy · All branches")).toBeVisible();
  });

  test("branch user can only choose an assigned branch", async ({ page }) => {
    await signIn(page, "main.teacher@example.test");
    await page.getByLabel(/^Branch:/).click();
    await expect(page.getByRole("button", { name: /Main Campus/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /North Campus/ })).toHaveCount(0);
  });

  test("teacher dashboard shows their access and no staff figures", async ({ page }) => {
    await signIn(page, "main.teacher@example.test");
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
    await signIn(page, "admin@example.test");
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
      await signIn(page, "admin@example.test");
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
    await signIn(page, "admin@example.test");
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
    await signIn(page, "admin@example.test");
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

test.describe("appearance", () => {
  test("dark mode can be chosen, is remembered, and can be switched back", async ({ page }) => {
    await signIn(page, "admin@example.test");
    const sidebar = page.getByRole("complementary");
    await sidebar.getByRole("radio", { name: /Dark/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(sidebar.getByRole("radio", { name: /Dark/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await sidebar.getByRole("radio", { name: /Light/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("follows the operating system when set to System", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await context.close();
  });

  test("dark mode has no serious accessibility violations", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => v.id),
    ).toEqual([]);
    await signIn(page, "admin@example.test");
    await expect(page.getByText("Your access")).toBeVisible();
    results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => v.id),
    ).toEqual([]);
    await context.close();
  });
});
