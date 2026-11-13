import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.pw.ts', workers: 1,
  outputDir: '/tmp/speaklog-v3-browser-results',
  use: { baseURL: 'http://127.0.0.1:4183', browserName: 'chromium', channel: 'chrome',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
