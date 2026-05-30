import { configDefaults, defineConfig } from 'vitest/config';

// Integration suites under test/integration/** require a live Postgres with
// migrations applied. CI doesn't run a database yet, so we skip them there
// (GH Actions sets CI=true). Locally `pnpm test` runs everything against the
// docker-compose Postgres from `pnpm db:up`. Unit specs under src/** always run.
const IS_CI = process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    exclude: IS_CI ? [...configDefaults.exclude, 'test/integration/**'] : configDefaults.exclude,
  },
});
