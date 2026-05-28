import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests talk to the real local Postgres (packages/db/docker-compose.yml).
    // Serialise so per-test seed → test → cleanup doesn't trip cross-test
    // tenant state. The cost is small at this size; we can parallelise once
    // a clean per-test transactional rollback wrapper exists.
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./test/setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
