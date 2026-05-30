// settingsService — per-tenant email settings (sender identity, CAN-SPAM
// footer address, brand fallback, default sending domain).
//
// EmailSettings has tenantId as its PK (one row per tenant), so reads return
// the row or a synthesized default (we don't create on read), and writes
// upsert. The full brand resolver (resolveBranding) that pulls storefront
// theme tokens lands with templates (P4); this surface owns the editable
// settings only.

import { withTenant } from '@sparx/db';
import type { EmailSettings } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishEmailEvent } from '../events';
import type { ServiceContext } from '../errors';
import { UpdateEmailSettingsInput } from '../schemas/settings';

export interface EmailSettingsView {
  tenantId: string;
  fromName: string | null;
  fromAddress: string | null;
  replyTo: string | null;
  physicalAddress: string | null;
  brandingOverride: Record<string, unknown>;
  defaultSendingDomainId: string | null;
}

function toView(tenantId: string, row: EmailSettings | null): EmailSettingsView {
  return {
    tenantId,
    fromName: row?.fromName ?? null,
    fromAddress: row?.fromAddress ?? null,
    replyTo: row?.replyTo ?? null,
    physicalAddress: row?.physicalAddress ?? null,
    brandingOverride: (row?.brandingOverride as Record<string, unknown>) ?? {},
    defaultSendingDomainId: row?.defaultSendingDomainId ?? null,
  };
}

export async function get(ctx: ServiceContext): Promise<EmailSettingsView> {
  const row = await withTenant(ctx, (tx) =>
    tx.emailSettings.findUnique({ where: { tenantId: ctx.tenantId } })
  );
  return toView(ctx.tenantId, row);
}

export async function update(ctx: ServiceContext, rawInput: unknown): Promise<EmailSettingsView> {
  const input = UpdateEmailSettingsInput.parse(rawInput);

  const data = {
    ...(input.fromName !== undefined ? { fromName: input.fromName } : {}),
    ...(input.fromAddress !== undefined ? { fromAddress: input.fromAddress } : {}),
    ...(input.replyTo !== undefined ? { replyTo: input.replyTo } : {}),
    ...(input.physicalAddress !== undefined ? { physicalAddress: input.physicalAddress } : {}),
    ...(input.brandingOverride !== undefined
      ? { brandingOverride: input.brandingOverride as object }
      : {}),
    ...(input.defaultSendingDomainId !== undefined
      ? { defaultSendingDomainId: input.defaultSendingDomainId }
      : {}),
  };

  const row = await withTenant(ctx, async (tx) => {
    const updated = await tx.emailSettings.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, ...data },
      update: data,
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.settings.updated',
      entityType: 'EmailSettings',
      entityId: ctx.tenantId,
      diff: { after: data },
    });
    return updated;
  });

  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: 'email.settings.updated',
    payload: { fields: Object.keys(data) },
    dedupeKey: `email.settings.updated:${ctx.tenantId}:${row.updatedAt.toISOString()}`,
  });

  return toView(ctx.tenantId, row);
}
