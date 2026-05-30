// automationService — default automations + the trigger evaluation engine.
//
// provisionDefaults seeds the PRD §4 automations per tenant (idempotent, on
// module activation). evaluateTrigger is the engine: for an inbound business
// event it finds enabled automations on that trigger, resolves the recipient,
// applies suppression + frequency-cap rules, and enqueues a ScheduledSend. The
// in-process email-dispatch tick (services/api-rest) later publishes email.send
// when each row is due — so delays (cart-abandon 2h, etc.) just work.

import { randomUUID } from 'node:crypto';
import { withTenant } from '@sparx/db';
import type { EmailAutomation, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishEmailEvent } from '../events';
import { EmailNotFoundError, type ServiceContext } from '../errors';
import { DEFAULT_AUTOMATIONS, getDefaultAutomation } from '../default-automations';
import { UpdateAutomationInput } from '../schemas/automations';
import { isSuppressed } from './suppression-service';

// Marketing automations respect a marketing-scope unsubscribe; the rest are
// transactional (only a hard 'all' suppression blocks them).
const MARKETING_KEYS = new Set(['cart-abandoned', 'win-back']);

export async function provisionDefaults(ctx: ServiceContext): Promise<EmailAutomation[]> {
  return withTenant(ctx, async (tx) => {
    const seeded: EmailAutomation[] = [];
    for (const def of DEFAULT_AUTOMATIONS) {
      const existing = await tx.emailAutomation.findUnique({
        where: { tenantId_key: { tenantId: ctx.tenantId, key: def.key } },
      });
      if (existing) {
        seeded.push(existing);
        continue;
      }
      const created = await tx.emailAutomation.create({
        data: {
          tenantId: ctx.tenantId,
          key: def.key,
          name: def.name,
          triggerEvent: def.triggerEvent,
          delaySeconds: def.delaySeconds,
          frequencyCapSeconds: def.frequencyCapSeconds,
          enabled: def.defaultEnabled,
          canDisable: def.canDisable,
          status: 'active',
        },
      });
      seeded.push(created);
    }
    return seeded;
  });
}

export async function list(ctx: ServiceContext): Promise<EmailAutomation[]> {
  return withTenant(ctx, (tx) =>
    tx.emailAutomation.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] })
  );
}

export async function get(ctx: ServiceContext, id: string): Promise<EmailAutomation> {
  const row = await withTenant(ctx, (tx) => tx.emailAutomation.findUnique({ where: { id } }));
  if (!row) throw new EmailNotFoundError('EmailAutomation', id);
  return row;
}

export async function update(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<EmailAutomation> {
  const input = UpdateAutomationInput.parse(rawInput);
  const existing = await get(ctx, id);
  // A non-disable-able automation cannot be turned off.
  const enabled = !existing.canDisable && input.enabled === false ? true : input.enabled;

  const row = await withTenant(ctx, async (tx) => {
    const updated = await tx.emailAutomation.update({
      where: { id },
      data: {
        ...(enabled !== undefined ? { enabled } : {}),
        ...(input.delaySeconds !== undefined ? { delaySeconds: input.delaySeconds } : {}),
        ...(input.frequencyCapSeconds !== undefined
          ? { frequencyCapSeconds: input.frequencyCapSeconds }
          : {}),
        ...(input.conditions !== undefined
          ? { conditions: input.conditions as Prisma.InputJsonValue }
          : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.automation.updated',
      entityType: 'EmailAutomation',
      entityId: id,
      diff: { before: { enabled: existing.enabled }, after: { enabled: updated.enabled } },
    });
    return updated;
  });

  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: row.enabled ? 'email.automation.enabled' : 'email.automation.disabled',
    payload: { automationId: row.id, key: row.key },
    dedupeKey: `email.automation.updated:${row.id}:${row.updatedAt.toISOString()}`,
  });

  return row;
}

// ── The engine ─────────────────────────────────────────────────────────────

interface TriggerEvent {
  type: string;
  data: Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function resolveRecipient(data: Record<string, unknown>): string | undefined {
  return str(data.email) ?? str(data.customerEmail) ?? str(data.to) ?? str(data.recipient);
}

/**
 * Evaluate an inbound event against enabled automations and enqueue sends.
 * Returns how many ScheduledSend rows were created.
 */
export async function evaluateTrigger(
  ctx: ServiceContext,
  event: TriggerEvent
): Promise<{ enqueued: number }> {
  const recipient = resolveRecipient(event.data);
  const customerId = str(event.data.customerId) ?? null;

  return withTenant(ctx, async (tx) => {
    const automations = await tx.emailAutomation.findMany({
      where: { triggerEvent: event.type, enabled: true, status: 'active' },
    });
    if (automations.length === 0) return { enqueued: 0 };
    if (!recipient) return { enqueued: 0 }; // can't address — drop silently

    let enqueued = 0;
    for (const automation of automations) {
      const def = automation.key ? getDefaultAutomation(automation.key) : undefined;
      const templateKey = def?.templateKey ?? automation.key ?? 'unknown';
      const scope: 'marketing' | 'transactional' =
        automation.key && MARKETING_KEYS.has(automation.key) ? 'marketing' : 'transactional';

      // Suppression check (RLS-scoped via the same tx context).
      if (await isSuppressed(ctx, recipient, scope)) continue;

      const cap = automation.frequencyCapSeconds;
      const idemPart = cap
        ? String(Math.floor(Date.now() / (cap * 1000)))
        : (str(event.data.idempotencyKey) ??
          str(event.data.orderId) ??
          str(event.data.id) ??
          randomUUID());
      const dedupeKey = `auto:${automation.key ?? automation.id}:${recipient}:${idemPart}`;

      const dueAt = new Date(Date.now() + automation.delaySeconds * 1000);

      const result = await tx.scheduledSend.createMany({
        data: [
          {
            tenantId: ctx.tenantId,
            automationId: automation.id,
            recipient,
            customerId,
            payload: {
              template: templateKey,
              props: event.data,
              automationKey: automation.key,
            } as Prisma.InputJsonValue,
            dueAt,
            status: 'pending',
            dedupeKey,
          },
        ],
        skipDuplicates: true, // frequency cap + idempotency via (tenant, dedupeKey)
      });
      enqueued += result.count;
    }

    return { enqueued };
  });
}
