// Vitest setup — force the test env BEFORE app.ts evaluates so the Fastify
// logger turns off and per-test noise stays low. The DATABASE_URL is read
// from the real .env (or shell), which points at the local docker Postgres.

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.SPARX_INTERNAL_JWT_SECRET ??= 'dev-only-internal-jwt-secret-change-me-32chars';
process.env.PORT ??= '0';
