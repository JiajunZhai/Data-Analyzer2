import { defineConfig } from '@playwright/test';

const deployedUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'filter-dropdowns.spec.ts',
  use: { baseURL: deployedUrl ?? 'http://127.0.0.1:5188' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: deployedUrl
    ? undefined
    : {
        command: 'npm run preview -- --host 127.0.0.1 --port 5188 --strictPort',
        url: 'http://127.0.0.1:5188',
        reuseExistingServer: false,
      },
});
