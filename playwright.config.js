import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/e2e', timeout: 30000, fullyParallel: false, workers: 1, retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'line',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', screenshot: 'only-on-failure', trace: 'retain-on-failure' }
});
