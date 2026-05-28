// Vitest setup. Fills in the env vars media-worker's Zod schema requires
// so module-load doesn't EX_CONFIG-abort when the test runner doesn't
// have a real GCP project / DB URL configured. The values are dummy —
// transcode.ts is pure and doesn't touch GCS or Postgres in unit tests.

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5544/test';
process.env.GCP_PROJECT_ID ??= 'test-project';
process.env.GCS_MEDIA_BUCKET ??= 'test-bucket';
process.env.GCS_MEDIA_PUBLIC_BUCKET ??= 'test-bucket-public';
