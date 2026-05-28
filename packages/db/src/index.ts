export { prisma } from './client';
export { withTenant } from './tenant-context';
export type { TenantContext, TxClient } from './tenant-context';

export type {
  Tenant,
  User,
  Session,
  Account,
  Verification,
  AuditLog,
  Prisma,
} from '@prisma/client';
