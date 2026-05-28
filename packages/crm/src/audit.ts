// Audit log helper.
//
// Every state-changing CRM service function writes an audit_logs row inside
// the same transaction as its primary write. The shape mirrors docs/16 §7:
// (tenant_id, actor_id, actor_type, action, entity_type, entity_id, diff).
//
// We inline this rather than depending on a separate @sparx/audit package
// because audit_logs is in @sparx/db (foundational table) and every module
// is going to grow its own equivalent helper — making it a separate package
// just to share six lines of insert SQL is premature.

import type { TxClient } from '@sparx/db';

export interface AuditWriteInput {
  tx: TxClient;
  tenantId: string;
  actorId: string | null;
  actorType: 'user' | 'system' | 'api' | 'mcp' | 'customer';
  action: string; // e.g. "crm.customer.created", "crm.deal.stage_changed"
  entityType: string; // e.g. "Customer", "Deal"
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
      diff: (input.diff ?? null) as never, // Prisma's Json type accepts null
    },
  });
}
