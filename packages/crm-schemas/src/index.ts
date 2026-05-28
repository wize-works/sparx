// Sparx CRM — schema package barrel.
//
// Single source of truth for the shape of every Server Action / REST / MCP
// write into the CRM. The service layer (@sparx/crm) and Server Actions
// (apps/dashboard/app/(dashboard)/crm) both validate inputs against these
// Zod schemas before touching Prisma — keeping the JSONB and column writes
// type-safe across transports.

export * from './customers.js';
export * from './b2b-accounts.js';
export * from './pipelines.js';
export * from './deals.js';
export * from './activities.js';
export * from './tasks.js';
export * from './segments.js';
export * from './segment-rule.js';
export * from './common.js';
