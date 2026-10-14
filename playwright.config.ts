import { defineConfig, devices } from "@playwright/test";

const port = 3218;

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one seeded database and server.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  // Generous: local runs reach the Neon test branch over the internet.
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx --conditions=react-server scripts/e2e-server.ts",
    url: `http://localhost:${port}/login`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
  },
});
