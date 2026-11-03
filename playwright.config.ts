import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  outputDir: "artifacts/playwright/results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "artifacts/playwright/report", open: "never" }],
  ],
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Yekaterinburg",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.BROWSER_PATH
      ? { executablePath: process.env.BROWSER_PATH }
      : {},
  },
});
