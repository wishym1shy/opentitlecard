// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 'github' turns failures into annotations on the check run, so they are readable without opening the logs
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
