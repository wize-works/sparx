import { configDefaults, defineConfig } from 'vitest/config';

// Integration suites need a live Postgres + the same JWT secret api-rest uses.
// CI skips them; locally `pnpm db:up` then `pnpm test` runs the whole thing.
const IS_CI = process.env.CI === 'true' || process.env.CI === '1';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./test/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    exclude: IS_CI ? [...configDefaults.exclude, 'test/**'] : configDefaults.exclude,
  },
});
