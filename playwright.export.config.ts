import { defineConfig, devices } from '@playwright/test';

const host = '127.0.0.1';
const port = 4273;
const basePath = '/release/checkpoint/';
const baseURL = `http://${host}:${port}${basePath}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /export-static\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `pnpm export:player && node scripts/serve-static-export.mjs --dir exports/player-static --base ${basePath} --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox-smoke',
      grep: /@export-smoke/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit-smoke',
      grep: /@export-smoke/,
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
