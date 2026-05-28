import { PrismaClient } from '@prisma/client';

// Dedicated Prisma client for Better Auth.
//
// Auth queries (sign-in, session lookup, OAuth callbacks) run BEFORE we know
// which tenant the request belongs to — they need to read users / sessions /
// accounts without an app.tenant_id GUC set. So this client connects as
// `sparx_owner` (table owner, NOT subject to ENABLED-but-not-FORCED RLS).
//
// Business-data queries should NOT use this client. They use the @sparx/db
// default client (connected as sparx_app, NOBYPASSRLS) wrapped in withTenant()
// so cross-tenant reads are impossible.

declare global {
  var __sparxAuthPrisma: PrismaClient | undefined;
}

function pickUrl(): string {
  const explicit = process.env.AUTH_DATABASE_URL;
  if (explicit) return explicit;

  const migration = process.env.MIGRATION_DATABASE_URL;
  if (migration) return migration;

  // Last resort: dev fallback so a fresh checkout boots without env wiring.
  return 'postgresql://sparx_owner:devpassword@localhost:5544/sparx?schema=public';
}

export const authPrisma: PrismaClient =
  globalThis.__sparxAuthPrisma ??
  new PrismaClient({
    datasourceUrl: pickUrl(),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__sparxAuthPrisma = authPrisma;
}
