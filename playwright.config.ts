import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/** End-to-end tests run against the production build: `npm run build` first. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx tsx server/index.ts --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Separate data folder and a known host secret so tests never touch real games.
    env: {
      SPLENDOR_ADMIN_SECRET: process.env.E2E_ADMIN_SECRET ?? 'e2e-admin-secret-1234',
      SPLENDOR_DATA_DIR: '.e2e-data',
    },
  },
});
