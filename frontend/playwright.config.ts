import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  outputDir: '../output/playwright/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: '../output/playwright/ui-results.json' }],
    ['html', { outputFolder: '../output/playwright/report', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5175',
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
