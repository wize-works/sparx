// Audit log writer.
//
// Every state-changing operation that mutates tenant data writes one row to
// `audit_logs`. The diff is the JSON-patch-equivalent shape `{ before, after }`
// so we can reconstruct what changed without storing the full row in two
// places. `audit_logs` has its own FORCE-RLS policy so writes only succeed
// inside a withRequestTenant transaction.
//
// Schema reference: packages/db/prisma/schema.prisma — model AuditLog
// (entityType / entityId / action / diff / ipAddress / userAgent).

import type { TxClient } from '@sparx/db';
import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import type { AuthContext } from './auth.js';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(
  tx: TxClient,
  request: FastifyRequest,
  auth: AuthContext,
  entry: AuditEntry
): Promise<void> {
  const diff =
    entry.before !== undefined || entry.after !== undefined
      ? { before: entry.before ?? null, after: entry.after ?? null }
      : null;

  await tx.auditLog.create({
    data: {
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorType: auth.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      // Prisma's JSON field accepts `JsonNullValueInput` or
      // `InputJsonValue` — passing JS `null` is a runtime error, so we
      // explicitly use `Prisma.JsonNull` for the "no diff" case.
      diff: diff === null ? Prisma.JsonNull : (diff as unknown as Prisma.InputJsonValue),
      ipAddress: request.ip || null,
      userAgent: request.headers['user-agent'] ?? null,
    },
  });
}
