export { prisma } from './client.js';
export { withTenant } from './tenant-context.js';
export type { TenantContext, TxClient } from './tenant-context.js';

export type {
  Tenant,
  User,
  Session,
  Account,
  Verification,
  AuditLog,
  Prisma,
} from '@prisma/client';
