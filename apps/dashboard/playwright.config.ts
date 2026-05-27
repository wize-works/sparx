import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3001);
const baseURL = `http://localhost:${PORT}`;
const isCI = Boolean(process.env.CI);

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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Use the production build in CI for realism; `next dev` locally for speed.
  // `reuseExistingServer` lets a manually-started dev server be reused.
  webServer: {
    command: isCI ? `pnpm next start --port ${PORT}` : `pnpm next dev --port ${PORT}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !isCI,
  },
});
