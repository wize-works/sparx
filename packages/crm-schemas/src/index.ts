// Sparx CRM — schema package barrel.
//
// Single source of truth for the shape of every Server Action / REST / MCP
// write into the CRM. The service layer (@sparx/crm) and Server Actions
// (apps/dashboard/app/(dashboard)/crm) both validate inputs against these
// Zod schemas before touching Prisma — keeping the JSONB and column writes
// type-safe across transports.

export * from './customers';
export * from './b2b-accounts';
export * from './pipelines';
export * from './deals';
export * from './activities';
export * from './tasks';
export * from './segments';
export * from './segment-rule';
export * from './common';
