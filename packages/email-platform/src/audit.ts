// Audit log helper (mirrors @sparx/crm audit).
//
// Every state-changing email-platform service function writes an audit_logs
// row inside the same transaction as its primary write. Shape per docs/16 §7:
// (tenant_id, actor_id, actor_type, action, entity_type, entity_id, diff).

import type { TxClient } from '@sparx/db';

export interface AuditWriteInput {
  tx: TxClient;
  tenantId: string;
  actorId: string | null;
  actorType: 'user' | 'system' | 'api' | 'mcp' | 'customer';
  action: string; // e.g. "email.broadcast.scheduled", "email.domain.verified"
  entityType: string; // e.g. "Broadcast", "SendingDomain"
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
