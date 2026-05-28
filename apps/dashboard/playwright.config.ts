import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

const STORAGE_STATE = path.resolve(__dirname, 'playwright/.auth/user.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    // Runs once; signs the test user up and saves the session cookie that the
    // chromium project reuses for every other spec.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    // Auth flow itself must use a clean session (otherwise we are already
    // logged in when we try to test sign-in). No storageState, no dependency.
    {
      name: 'auth-flow',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'chromium',
      testIgnore: /auth\.(setup|spec)\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      dependencies: ['setup'],
    },
  ],
  // Two web servers: the dashboard (this app) AND services/api-rest, which
  // the CMS server actions call. Playwright boots both before tests run.
  // Use the production build in CI for realism; `next dev` locally for speed.
  // `reuseExistingServer` lets a manually-started server be reused.
  webServer: [
    {
      command: isCI ? `pnpm next start --port ${PORT}` : `pnpm next dev --port ${PORT}`,
      url: baseURL,
      timeout: 120_000,
      reuseExistingServer: !isCI,
    },
    {
      command: 'pnpm --filter @sparx/api-rest dev',
      url: 'http://localhost:3100/health',
      timeout: 120_000,
      reuseExistingServer: !isCI,
    },
  ],
});
