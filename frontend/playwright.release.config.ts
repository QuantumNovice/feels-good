import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './tests',
  testMatch: ['ui/*.spec.ts', 'showcase/*.spec.ts'],
  outputDir: '../output/playwright/release-results',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5176' },
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
