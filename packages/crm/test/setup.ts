// Vitest setup — keep noise low and ensure the DB env points at local docker.

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';

// The @sparx/db client picks DATABASE_URL up from the surrounding shell. If
// vitest is invoked from the package root (`pnpm test`), the cwd inherits the
// repo .env via tsx/dotenv resolution upstream; if not, the docker-compose
// default works as a fallback.
process.env.DATABASE_URL ??=
  'postgresql://sparx_app:devpassword@localhost:5544/sparx?schema=public';
process.env.MIGRATION_DATABASE_URL ??=
  'postgresql://sparx_owner:devpassword@localhost:5544/sparx?schema=public';
