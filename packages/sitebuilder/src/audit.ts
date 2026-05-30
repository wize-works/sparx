// Audit log helper. Every state-changing service function writes an
// audit_logs row inside the same transaction as its primary write
// (action e.g. "sitebuilder.published"). Mirrors packages/crm/src/audit.ts.

import type { TxClient } from '@sparx/db';

export interface AuditWriteInput {
  tx: TxClient;
  tenantId: string;
  actorId: string | null;
  actorType: 'user' | 'system' | 'api' | 'mcp' | 'customer';
  action: string;
  entityType: string;
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
