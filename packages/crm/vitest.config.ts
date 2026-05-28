import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests run against the real local Postgres (packages/db/docker-compose.yml).
    // Serial execution keeps per-test tenant provisioning predictable — the
    // cost is small at this size, and we can parallelize once a transactional
    // rollback wrapper is in place (none of the services accept an external
    // tx today; they each open their own via withTenant).
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
