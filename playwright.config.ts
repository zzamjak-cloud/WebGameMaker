import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = 4173;
const basePath = "/phase-0/nested/";
const baseURL = `http://${host}:${port}${basePath}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `pnpm --filter @web-game-maker/player build && pnpm --filter @web-game-maker/player preview --host ${host} --port ${port} --base ${basePath}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-smoke",
      grep: /@smoke/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-smoke",
      grep: /@smoke/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
