import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Loaded before any test module — populates the env vars our Zod
    // schema needs so module-load doesn't EX_CONFIG-abort.
    setupFiles: ['./test/setup.ts'],
  },
});
