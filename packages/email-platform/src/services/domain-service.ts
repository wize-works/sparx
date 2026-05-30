// domainService — per-tenant Mailgun sending domains.
//
// create() provisions the domain in Mailgun and persists the verbatim
// sending_dns_records the merchant must publish (the SPF string is copied
// exactly — Mailgun's verifier requires the canonical form). verify() asks
// Mailgun to re-check DNS and flips state. The dashboard drives verify
// on-demand ("Check verification"); a background re-check tick can call the
// same path later.
//
// State: pending → verifying → verified (or failed/disabled). Maps Mailgun's
// unverified|active|disabled onto our richer set.

import { withTenant } from '@sparx/db';
import type { Prisma, SendingDomain } from '@sparx/db';
import { getMailgunDomainAdmin, MailgunAdminError, type MailgunDomainResult } from '@sparx/email';

import { writeAuditLog } from '../audit';
import { publishEmailEvent } from '../events';
import { EmailNotFoundError, EmailProviderError, type ServiceContext } from '../errors';
import { CreateSendingDomainInput } from '../schemas/domains';

function mapState(mailgunState: string): string {
  switch (mailgunState) {
    case 'active':
      return 'verified';
    case 'disabled':
      return 'disabled';
    default:
      return 'pending';
  }
}

async function provider<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof MailgunAdminError) {
      throw new EmailProviderError('mailgun', err.message, err.status);
    }
    throw err;
  }
}

export async function list(ctx: ServiceContext): Promise<SendingDomain[]> {
  return withTenant(ctx, (tx) =>
    tx.sendingDomain.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })
  );
}

export async function get(ctx: ServiceContext, id: string): Promise<SendingDomain> {
  const row = await withTenant(ctx, (tx) => tx.sendingDomain.findUnique({ where: { id } }));
  if (!row) throw new EmailNotFoundError('SendingDomain', id);
  return row;
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<SendingDomain> {
  const input = CreateSendingDomainInput.parse(rawInput);

  // Provision in Mailgun first; if that fails we never persist a row.
  const result: MailgunDomainResult = await provider(() =>
    getMailgunDomainAdmin().createDomain(input.domain, { region: input.region })
  );

  const row = await withTenant(ctx, async (tx) => {
    const created = await tx.sendingDomain.create({
      data: {
        tenantId: ctx.tenantId,
        domain: input.domain,
        mailgunDomainId: result.name,
        region: input.region,
        state: mapState(result.state),
        dnsRecords: result.sendingDnsRecords as unknown as Prisma.InputJsonValue,
        dkimSelector: result.dkimSelector ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.domain.created',
      entityType: 'SendingDomain',
      entityId: created.id,
      diff: { after: { domain: created.domain, region: created.region } },
    });
    return created;
  });

  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: 'email.domain.created',
    payload: { domainId: row.id, domain: row.domain },
    dedupeKey: `email.domain.created:${row.id}`,
  });

  return row;
}

export async function verify(ctx: ServiceContext, id: string): Promise<SendingDomain> {
  const existing = await get(ctx, id);

  const result: MailgunDomainResult = await provider(() =>
    getMailgunDomainAdmin().verifyDomain(existing.domain)
  );
  const nextState = mapState(result.state);
  const verified = nextState === 'verified';
  // If Mailgun still reports unverified after a check, distinguish "we asked
  // and DNS isn't propagated yet" (verifying) from the untouched pending state.
  const state = verified ? 'verified' : existing.state === 'pending' ? 'verifying' : nextState;

  const row = await withTenant(ctx, async (tx) => {
    const updated = await tx.sendingDomain.update({
      where: { id },
      data: {
        state,
        dnsRecords: result.sendingDnsRecords as unknown as Prisma.InputJsonValue,
        dkimSelector: result.dkimSelector ?? existing.dkimSelector,
        lastCheckedAt: new Date(),
        ...(verified ? { verifiedAt: new Date() } : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: verified ? 'email.domain.verified' : 'email.domain.verify_checked',
      entityType: 'SendingDomain',
      entityId: id,
      diff: { before: { state: existing.state }, after: { state } },
    });
    return updated;
  });

  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: verified ? 'email.domain.verified' : 'email.domain.verifying',
    payload: { domainId: row.id, domain: row.domain, state: row.state },
    dedupeKey: `email.domain.${row.state}:${row.id}:${row.lastCheckedAt?.toISOString() ?? ''}`,
  });

  return row;
}

export async function setDefault(ctx: ServiceContext, id: string): Promise<SendingDomain> {
  const existing = await get(ctx, id);

  return withTenant(ctx, async (tx) => {
    await tx.sendingDomain.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    const updated = await tx.sendingDomain.update({
      where: { id },
      data: { isDefault: true },
    });
    await tx.emailSettings.upsert({
      where: { tenantId: ctx.tenantId },
      create: { tenantId: ctx.tenantId, defaultSendingDomainId: id },
      update: { defaultSendingDomainId: id },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.domain.set_default',
      entityType: 'SendingDomain',
      entityId: id,
      diff: { after: { domain: existing.domain } },
    });
    return updated;
  });
}

export async function remove(ctx: ServiceContext, id: string): Promise<void> {
  const existing = await get(ctx, id);

  // Best-effort delete in Mailgun — a 404 there (already gone) shouldn't block
  // removing our row.
  try {
    await getMailgunDomainAdmin().deleteDomain(existing.domain);
  } catch (err) {
    if (!(err instanceof MailgunAdminError) || err.status !== 404) {
      // Transient/unexpected — surface so the caller can retry.
      if (err instanceof MailgunAdminError) {
        throw new EmailProviderError('mailgun', err.message, err.status);
      }
      throw err;
    }
  }

  await withTenant(ctx, async (tx) => {
    await tx.sendingDomain.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.domain.removed',
      entityType: 'SendingDomain',
      entityId: id,
      diff: { before: { domain: existing.domain } },
    });
  });
}
