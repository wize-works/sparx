// b2bAccountService — CRUD for the B2B account record (docs/10 §2).
//
// Phase 1 ships the spine. The B2B module (separate workstream) will layer
// quote/credit-hold/approval-workflow business logic on top — those FKs
// back into b2b_accounts rather than redefining the account.

import { CreateB2BAccountInput, UpdateB2BAccountInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { B2BAccount, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError } from '../errors';

export interface ListB2BAccountsFilter {
  status?: 'active' | 'credit_hold' | 'suspended' | 'inactive';
  assignedRepId?: string | null;
  q?: string;
  take?: number;
  skip?: number;
}

export async function list(
  ctx: ServiceContext,
  filter: ListB2BAccountsFilter = {}
): Promise<{ items: B2BAccount[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.B2BAccountWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.assignedRepId !== undefined ? { assignedRepId: filter.assignedRepId } : {}),
      ...(filter.q ? { companyName: { contains: filter.q, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      tx.b2BAccount.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.b2BAccount.count({ where }),
    ]);

    return { items, total };
  });
}

export async function get(ctx: ServiceContext, accountId: string): Promise<B2BAccount> {
  const account = await withTenant(ctx, (tx) =>
    tx.b2BAccount.findUnique({ where: { id: accountId } })
  );
  if (account?.deletedAt !== null) {
    throw new CrmNotFoundError('B2BAccount', accountId);
  }
  return account;
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<B2BAccount> {
  const input = CreateB2BAccountInput.parse(rawInput);

  const account = await withTenant(ctx, async (tx) => {
    const created = await tx.b2BAccount.create({
      data: {
        tenantId: ctx.tenantId,
        companyName: input.companyName,
        taxId: input.taxId ?? null,
        website: input.website ?? null,
        pricingTier: input.pricingTier ?? null,
        creditLimit: input.creditLimit,
        paymentTerms: input.paymentTerms ?? null,
        discountPercent: input.discountPercent,
        status: input.status,
        assignedRepId: input.assignedRepId ?? null,
        fleetSize: input.fleetSize ?? null,
        engineProfiles: input.engineProfiles,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.b2b_account.created',
      entityType: 'B2BAccount',
      entityId: created.id,
      diff: { after: { id: created.id, companyName: created.companyName } },
    });

    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.b2b_account.created',
    payload: { b2bAccountId: account.id, companyName: account.companyName },
    dedupeKey: `crm.b2b_account.created:${account.id}`,
  });

  return account;
}

export async function update(
  ctx: ServiceContext,
  accountId: string,
  rawInput: unknown
): Promise<B2BAccount> {
  const input = UpdateB2BAccountInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.b2BAccount.findUnique({ where: { id: accountId } });
    if (before?.deletedAt !== null) {
      throw new CrmNotFoundError('B2BAccount', accountId);
    }

    const updated = await tx.b2BAccount.update({
      where: { id: accountId },
      data: {
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.pricingTier !== undefined ? { pricingTier: input.pricingTier } : {}),
        ...(input.creditLimit !== undefined ? { creditLimit: input.creditLimit } : {}),
        ...(input.paymentTerms !== undefined ? { paymentTerms: input.paymentTerms } : {}),
        ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.assignedRepId !== undefined ? { assignedRepId: input.assignedRepId } : {}),
        ...(input.fleetSize !== undefined ? { fleetSize: input.fleetSize } : {}),
        ...(input.engineProfiles !== undefined
          ? { engineProfiles: input.engineProfiles }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.b2b_account.updated',
      entityType: 'B2BAccount',
      entityId: updated.id,
      diff: { before: { status: before.status }, after: { status: updated.status } },
    });

    return updated;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.b2b_account.updated',
    payload: { b2bAccountId: result.id, status: result.status },
    dedupeKey: `crm.b2b_account.updated:${result.id}:${result.updatedAt.toISOString()}`,
  });

  return result;
}

export async function softDelete(ctx: ServiceContext, accountId: string): Promise<B2BAccount> {
  return withTenant(ctx, async (tx) => {
    const before = await tx.b2BAccount.findUnique({ where: { id: accountId } });
    if (before?.deletedAt !== null) {
      throw new CrmNotFoundError('B2BAccount', accountId);
    }
    const updated = await tx.b2BAccount.update({
      where: { id: accountId },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.b2b_account.deleted',
      entityType: 'B2BAccount',
      entityId: updated.id,
      diff: null,
    });
    return updated;
  });
}
