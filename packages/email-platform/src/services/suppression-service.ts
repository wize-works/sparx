// suppressionService — the suppression list (mirrors Mailgun suppressions +
// manual entries). A suppressed address is never sent the matching scope of
// mail again; the send paths (automations, broadcasts) filter recipients
// against isSuppressed() before enqueuing.

import { withTenant } from '@sparx/db';
import type { EmailSuppression, Prisma, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishEmailEvent } from '../events';
import { EmailNotFoundError, type ServiceContext } from '../errors';
import {
  AddSuppressionInput,
  ImportSuppressionsInput,
  ListSuppressionsQuery,
} from '../schemas/suppressions';

export async function list(
  ctx: ServiceContext,
  rawQuery: unknown = {}
): Promise<{ items: EmailSuppression[]; total: number }> {
  const q = ListSuppressionsQuery.parse(rawQuery);
  const where: Prisma.EmailSuppressionWhereInput = {
    ...(q.scope ? { scope: q.scope } : {}),
    ...(q.q ? { email: { contains: q.q.toLowerCase() } } : {}),
  };
  return withTenant(ctx, async (tx) => {
    const [items, total] = await Promise.all([
      tx.emailSuppression.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(q.limit ?? 100, 1000),
        skip: q.offset ?? 0,
      }),
      tx.emailSuppression.count({ where }),
    ]);
    return { items, total };
  });
}

/** True if `email` is suppressed for the given scope. A row with scope='all'
 *  suppresses both transactional and marketing. */
export async function isSuppressed(
  ctx: ServiceContext,
  email: string,
  scope: 'transactional' | 'marketing'
): Promise<boolean> {
  const count = await withTenant(ctx, (tx) =>
    tx.emailSuppression.count({
      where: { email: email.toLowerCase(), scope: { in: [scope, 'all'] } },
    })
  );
  return count > 0;
}

export async function add(ctx: ServiceContext, rawInput: unknown): Promise<EmailSuppression> {
  const input = AddSuppressionInput.parse(rawInput);

  const row = await withTenant(ctx, async (tx) => {
    const created = await tx.emailSuppression.upsert({
      where: {
        tenantId_email_scope: {
          tenantId: ctx.tenantId,
          email: input.email,
          scope: input.scope,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        email: input.email,
        scope: input.scope,
        reason: input.reason,
        source: 'manual',
        note: input.note ?? null,
      },
      update: { reason: input.reason, note: input.note ?? null },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.suppression.added',
      entityType: 'EmailSuppression',
      entityId: created.id,
      diff: { after: { email: created.email, scope: created.scope, reason: created.reason } },
    });
    return created;
  });

  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: 'email.suppression.added',
    payload: { email: row.email, scope: row.scope, reason: row.reason },
    dedupeKey: `email.suppression.added:${row.id}`,
  });

  return row;
}

export async function importMany(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ added: number }> {
  const input = ImportSuppressionsInput.parse(rawInput);
  const unique = Array.from(new Set(input.emails.map((e) => e.toLowerCase())));

  const added = await withTenant(ctx, async (tx) => {
    const result = await tx.emailSuppression.createMany({
      data: unique.map((email) => ({
        tenantId: ctx.tenantId,
        email,
        scope: input.scope,
        reason: input.reason,
        source: 'import',
      })),
      skipDuplicates: true,
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.suppression.imported',
      entityType: 'EmailSuppression',
      entityId: ctx.tenantId,
      diff: { after: { count: result.count, scope: input.scope } },
    });
    return result.count;
  });

  return { added };
}

export async function remove(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.emailSuppression.findUnique({ where: { id } });
    if (!existing) throw new EmailNotFoundError('EmailSuppression', id);
    await tx.emailSuppression.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.suppression.removed',
      entityType: 'EmailSuppression',
      entityId: id,
      diff: { before: { email: existing.email, scope: existing.scope } },
    });
  });

  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: 'email.suppression.removed',
    payload: { suppressionId: id },
    dedupeKey: `email.suppression.removed:${id}`,
  });
}

/** Record a suppression originating from a provider webhook (bounce, complaint,
 *  unsubscribe). Idempotent; used by webhook-service inside an existing tx. */
export async function recordFromWebhook(
  tx: TxClient,
  tenantId: string,
  input: { email: string; scope: string; reason: string; customerId?: string | null }
): Promise<void> {
  await tx.emailSuppression.upsert({
    where: {
      tenantId_email_scope: { tenantId, email: input.email.toLowerCase(), scope: input.scope },
    },
    create: {
      tenantId,
      email: input.email.toLowerCase(),
      scope: input.scope,
      reason: input.reason,
      source: 'mailgun',
      customerId: input.customerId ?? null,
    },
    update: { reason: input.reason },
  });
}
