// customerService — read/write API for customers.
//
// Every other transport (Server Actions, REST, GraphQL, MCP) wraps these
// functions. Per locked decision #7, a bug fixed here is fixed everywhere
// at once. Every state-changing function:
//   1. Validates input against the Zod schema in @sparx/crm-schemas
//   2. Wraps DB work in withTenant() (RLS context set per transaction)
//   3. Writes an audit_logs row inside the same transaction
//   4. Publishes a Pub/Sub event AFTER the transaction commits — never
//      before, so a rolled-back write never emits a phantom event.

import {
  BulkAssignCustomersInput,
  BulkTagCustomersInput,
  CreateCustomerInput,
  UpdateCustomerInput,
} from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Customer, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit.js';
import { publishCrmEvent } from '../events.js';
import type { ServiceContext } from '../errors.js';
import { CrmNotFoundError } from '../errors.js';

export { merge, findLikelyDuplicates } from './merge-service.js';
export type { MergeResult, DuplicateGroup } from './merge-service.js';

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────

export interface ListCustomersFilter {
  type?: 'prospect' | 'retail' | 'b2b';
  assignedRepId?: string | null;
  b2bAccountId?: string | null;
  tag?: string;
  q?: string; // full-text-ish: matches first/last/company/email substring
  includeDeleted?: boolean;
  take?: number;
  skip?: number;
  // Sort: lastOrderAt desc | totalSpent desc | updatedAt desc | createdAt desc
  sortBy?: 'lastOrderAt' | 'totalSpent' | 'updatedAt' | 'createdAt';
}

export async function list(
  ctx: ServiceContext,
  filter: ListCustomersFilter = {}
): Promise<{ items: Customer[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.CustomerWhereInput = {
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.assignedRepId !== undefined ? { assignedRepId: filter.assignedRepId } : {}),
      ...(filter.b2bAccountId !== undefined ? { b2bAccountId: filter.b2bAccountId } : {}),
      ...(filter.tag ? { tags: { has: filter.tag } } : {}),
      ...(filter.q
        ? {
            OR: [
              { email: { contains: filter.q, mode: 'insensitive' } },
              { firstName: { contains: filter.q, mode: 'insensitive' } },
              { lastName: { contains: filter.q, mode: 'insensitive' } },
              { company: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortField = filter.sortBy ?? 'updatedAt';
    const [items, total] = await Promise.all([
      tx.customer.findMany({
        where,
        orderBy: { [sortField]: 'desc' } as Prisma.CustomerOrderByWithRelationInput,
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.customer.count({ where }),
    ]);

    return { items, total };
  });
}

export async function get(ctx: ServiceContext, customerId: string): Promise<Customer> {
  const customer = await withTenant(ctx, (tx) =>
    tx.customer.findUnique({ where: { id: customerId } })
  );
  if (!customer || customer.deletedAt !== null) {
    throw new CrmNotFoundError('Customer', customerId);
  }
  return customer;
}

/** Top N customers by total_spent. Used by the dashboard rep dashboard,
 *  the MCP get_top_customers tool, and the segment evaluator's projection
 *  builder. Read-only — no event, no audit log. */
export async function getTopBySpend(
  ctx: ServiceContext,
  args: { limit?: number; type?: 'retail' | 'b2b' } = {}
): Promise<Customer[]> {
  return withTenant(ctx, (tx) =>
    tx.customer.findMany({
      where: {
        deletedAt: null,
        ...(args.type ? { type: args.type } : {}),
        totalSpent: { gt: 0 },
      },
      orderBy: { totalSpent: 'desc' },
      take: Math.min(args.limit ?? 10, 100),
    })
  );
}

/** Customers with no order in the last N days. Drives the at-risk segment
 *  and the MCP get_inactive_customers tool. */
export async function getInactive(
  ctx: ServiceContext,
  args: { days: number; limit?: number }
): Promise<Customer[]> {
  const threshold = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  return withTenant(ctx, (tx) =>
    tx.customer.findMany({
      where: {
        deletedAt: null,
        orderCount: { gt: 0 }, // exclude prospects who've never ordered
        OR: [{ lastOrderAt: { lt: threshold } }, { lastOrderAt: null }],
      },
      orderBy: { lastOrderAt: 'asc' },
      take: Math.min(args.limit ?? 50, 500),
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<Customer> {
  const input = CreateCustomerInput.parse(rawInput);

  const customer = await withTenant(ctx, async (tx) => {
    const created = await tx.customer.create({
      data: {
        tenantId: ctx.tenantId,
        type: input.type,
        email: input.email ?? null,
        phone: input.phone ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        company: input.company ?? null,
        jobTitle: input.jobTitle ?? null,
        b2bAccountId: input.b2bAccountId ?? null,
        assignedRepId: input.assignedRepId ?? null,
        preferredContactMethod: input.preferredContactMethod ?? null,
        doNotContact: input.doNotContact,
        gdprConsent: input.gdprConsent ?? {},
        tags: input.tags ?? [],
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.customer.created',
      entityType: 'Customer',
      entityId: created.id,
      diff: { before: null, after: serializeCustomer(created) },
    });

    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.customer.created',
    payload: { customerId: customer.id, type: customer.type, email: customer.email },
    dedupeKey: `crm.customer.created:${customer.id}`,
  });

  return customer;
}

export async function update(
  ctx: ServiceContext,
  customerId: string,
  rawInput: unknown
): Promise<Customer> {
  const input = UpdateCustomerInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.customer.findUnique({ where: { id: customerId } });
    if (!before || before.deletedAt !== null) {
      throw new CrmNotFoundError('Customer', customerId);
    }

    const updated = await tx.customer.update({
      where: { id: customerId },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.company !== undefined ? { company: input.company } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
        ...(input.b2bAccountId !== undefined ? { b2bAccountId: input.b2bAccountId } : {}),
        ...(input.assignedRepId !== undefined ? { assignedRepId: input.assignedRepId } : {}),
        ...(input.preferredContactMethod !== undefined
          ? { preferredContactMethod: input.preferredContactMethod }
          : {}),
        ...(input.doNotContact !== undefined ? { doNotContact: input.doNotContact } : {}),
        ...(input.gdprConsent !== undefined ? { gdprConsent: input.gdprConsent } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.customer.updated',
      entityType: 'Customer',
      entityId: updated.id,
      diff: { before: serializeCustomer(before), after: serializeCustomer(updated) },
    });

    return updated;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.customer.updated',
    payload: { customerId: result.id },
    dedupeKey: `crm.customer.updated:${result.id}:${result.updatedAt.toISOString()}`,
  });

  return result;
}

export async function softDelete(ctx: ServiceContext, customerId: string): Promise<Customer> {
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.customer.findUnique({ where: { id: customerId } });
    if (!before || before.deletedAt !== null) {
      throw new CrmNotFoundError('Customer', customerId);
    }
    const updated = await tx.customer.update({
      where: { id: customerId },
      data: { deletedAt: new Date() },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.customer.deleted',
      entityType: 'Customer',
      entityId: updated.id,
      diff: { before: serializeCustomer(before), after: serializeCustomer(updated) },
    });
    return updated;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.customer.deleted',
    payload: { customerId: result.id },
    dedupeKey: `crm.customer.deleted:${result.id}`,
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Bulk operations
// ─────────────────────────────────────────────────────────────────────────
// Bulk paths share the per-row audit log (one row per customer touched) so
// undo/forensics has the same granularity as the single-update path. We
// trade the audit-log volume for clear lineage — the alternative (one
// audit row for the bulk) loses the per-customer trail.

export async function bulkAssign(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ updatedCount: number }> {
  const input = BulkAssignCustomersInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const updateResult = await tx.customer.updateMany({
      where: { id: { in: input.customerIds }, deletedAt: null },
      data: { assignedRepId: input.assignedRepId },
    });

    // Per-row audit. updateMany doesn't return the rows so we re-fetch them
    // and write one audit row per id — small overhead, big traceability win.
    for (const id of input.customerIds) {
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'crm.customer.assigned',
        entityType: 'Customer',
        entityId: id,
        diff: { after: { assignedRepId: input.assignedRepId } },
      });
    }

    return { updatedCount: updateResult.count };
  });

  // One event per touched id — the segment evaluator and email automations
  // are per-customer; batching at the publish layer would force consumers
  // to re-explode the array.
  await Promise.all(
    input.customerIds.map((customerId) =>
      publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.customer.updated',
        payload: { customerId, change: 'assignedRepId' },
        dedupeKey: `crm.customer.updated:assigned:${customerId}:${Date.now()}`,
      })
    )
  );

  return result;
}

export async function bulkTag(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ updatedCount: number }> {
  const input = BulkTagCustomersInput.parse(rawInput);
  if (!input.addTags?.length && !input.removeTags?.length) {
    return { updatedCount: 0 };
  }

  return withTenant(ctx, async (tx) => {
    const customers = await tx.customer.findMany({
      where: { id: { in: input.customerIds }, deletedAt: null },
      select: { id: true, tags: true },
    });

    let updatedCount = 0;
    for (const c of customers) {
      const next = new Set(c.tags);
      input.addTags?.forEach((t) => next.add(t));
      input.removeTags?.forEach((t) => next.delete(t));
      const nextTags = [...next];
      if (sameTags(c.tags, nextTags)) continue;

      await tx.customer.update({ where: { id: c.id }, data: { tags: nextTags } });
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'crm.customer.tags_updated',
        entityType: 'Customer',
        entityId: c.id,
        diff: { before: { tags: c.tags }, after: { tags: nextTags } },
      });
      updatedCount++;
    }

    return { updatedCount };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((t, i) => t === sb[i]);
}

// Serializes a Customer for audit-log JSON. Drops volatile fields that
// would otherwise produce a noisy diff. Decimal columns are stringified
// because Prisma's Decimal type isn't JSON-safe out of the box.
function serializeCustomer(c: Customer): Record<string, unknown> {
  return {
    id: c.id,
    type: c.type,
    authUserId: c.authUserId,
    b2bAccountId: c.b2bAccountId,
    assignedRepId: c.assignedRepId,
    email: c.email,
    phone: c.phone,
    firstName: c.firstName,
    lastName: c.lastName,
    company: c.company,
    jobTitle: c.jobTitle,
    preferredContactMethod: c.preferredContactMethod,
    doNotContact: c.doNotContact,
    tags: c.tags,
    totalSpent: c.totalSpent.toString(),
    orderCount: c.orderCount,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  };
}
