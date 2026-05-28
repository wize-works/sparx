import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from './client';

// `Prisma.TransactionClient` is the subset of PrismaClient methods that work
// inside a `$transaction(callback)` — no nested transactions, no $connect, etc.
export type TxClient = Prisma.TransactionClient;

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

// Postgres rejects parameter placeholders for `SET LOCAL`, so we validate the
// id matches the UUID shape before interpolating it. This is the only place in
// the codebase that should string-format a value into raw SQL.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`Invalid UUID for ${field}: ${value}`);
  }
}

/**
 * Run `fn` inside a transaction with `app.tenant_id` (and optionally
 * `app.user_id`) set on the connection. Row Level Security policies on
 * tenant-scoped tables filter against these GUCs — every API request handler
 * that touches tenant data must wrap its DB work in `withTenant`.
 *
 * Uses SET LOCAL so the GUC is scoped to the transaction and released on
 * commit/rollback. The transaction is the unit of connection-pinning Prisma
 * provides; without it the next query could land on a different pooled
 * connection that doesn't have the GUC set.
 *
 * @example
 *   const orders = await withTenant({ tenantId: req.tenant.id }, (tx) =>
 *     tx.order.findMany({ where: { status: 'pending' } })
 *   );
 */
export function withTenant<T>(
  context: TenantContext,
  fn: (tx: TxClient) => Promise<T>,
  client: PrismaClient = defaultPrisma
): Promise<T> {
  assertUuid(context.tenantId, 'tenantId');
  if (context.userId !== undefined) {
    assertUuid(context.userId, 'userId');
  }

  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${context.tenantId}'`);
    if (context.userId !== undefined) {
      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${context.userId}'`);
    }
    return fn(tx);
  });
}
