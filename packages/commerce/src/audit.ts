// Audit-log helper. Mirrors @sparx/crm's audit shape so every commerce
// state change is captured the same way and downstream tooling
// (compliance export, internal investigation queries, CRM activity feed)
// can read across modules with one shape.

import type { TxClient } from '@sparx/db';

export interface AuditWriteInput {
  tx: TxClient;
  tenantId: string;
  actorId: string | null;
  actorType: 'user' | 'system' | 'api' | 'mcp' | 'customer';
  action: string; // e.g. "commerce.product.created", "commerce.order.refunded"
  entityType: string; // e.g. "Product", "Variant", "Cart", "CheckoutSession"
  entityId: string;
  diff?: {
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  } | null;
}

export async function writeAuditLog(input: AuditWriteInput): Promise<void> {
  await input.tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      diff: (input.diff ?? null) as never,
    },
  });
}
