// customerService — create / read / update / softDelete round-trip plus the
// architectural commitments that aren't visible from the function signature:
//   • Audit log row is written in the same transaction (rolls back together).
//   • A crm.customer.created event publishes AFTER the write commits — never
//     before. Tests assert the RecordingPublisher captured exactly the
//     expected emissions.
//   • An invalid input rolls back the whole transaction (no partial state).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '@sparx/db';
import { customerService } from '../../src/services/index.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

describe('customerService', () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await makeTestContext('owner');
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  beforeEach(() => {
    test.publisher.clear();
  });

  it('create — persists fields, emits crm.customer.created, writes audit row', async () => {
    const customer = await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'kira@acmefleet.test',
      firstName: 'Kira',
      lastName: 'Wong',
      company: 'Acme Fleet',
      jobTitle: 'Fleet manager',
      tags: ['vip', 'fleet'],
    });

    expect(customer.tenantId).toBe(test.ctx.tenantId);
    expect(customer.type).toBe('b2b');
    expect(customer.email).toBe('kira@acmefleet.test');
    expect(customer.tags).toEqual(['vip', 'fleet']);
    expect(customer.deletedAt).toBeNull();

    // Event emitted exactly once, with the documented topic + payload.
    expect(test.publisher.events).toHaveLength(1);
    expect(test.publisher.events[0]?.topic).toBe('crm.customer.created');
    expect(test.publisher.events[0]?.tenantId).toBe(test.ctx.tenantId);
    expect(test.publisher.events[0]?.payload).toMatchObject({
      customerId: customer.id,
      type: 'b2b',
    });

    // Audit log written under the same tenant. Use a raw tenant-scoped query
    // because audit_logs is FORCE RLS and prisma exposes no context-bearing
    // helper at the top level (services use withTenant internally).
    const audits = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${test.ctx.tenantId}'`);
      return tx.auditLog.findMany({
        where: { entityId: customer.id, entityType: 'Customer' },
      });
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe('crm.customer.created');
    expect(audits[0]?.actorId).toBe(test.ctx.userId);
  });

  it('update — applies partial patch, emits crm.customer.updated', async () => {
    const created = await customerService.create(test.ctx, {
      type: 'prospect',
      email: 'lead@example.test',
      firstName: 'Lead',
    });
    test.publisher.clear();

    const updated = await customerService.update(test.ctx, created.id, {
      type: 'retail',
      tags: ['converted'],
    });

    expect(updated.type).toBe('retail');
    expect(updated.tags).toEqual(['converted']);
    expect(updated.email).toBe('lead@example.test'); // untouched

    expect(test.publisher.events).toHaveLength(1);
    expect(test.publisher.events[0]?.topic).toBe('crm.customer.updated');
  });

  it('softDelete — sets deletedAt and the row vanishes from list', async () => {
    const created = await customerService.create(test.ctx, {
      type: 'prospect',
      email: 'doomed@example.test',
    });
    test.publisher.clear();

    const deleted = await customerService.softDelete(test.ctx, created.id);
    expect(deleted.deletedAt).not.toBeNull();
    expect(test.publisher.events[0]?.topic).toBe('crm.customer.deleted');

    // get() refuses to return a soft-deleted row.
    await expect(customerService.get(test.ctx, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // list() defaults to excluding soft-deleted rows.
    const { items } = await customerService.list(test.ctx);
    expect(items.find((c) => c.id === created.id)).toBeUndefined();
  });

  it('list — filter by type returns only matching rows', async () => {
    await customerService.create(test.ctx, {
      type: 'retail',
      email: 'retail@example.test',
    });
    await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'b2b@example.test',
    });
    await customerService.create(test.ctx, {
      type: 'prospect',
      email: 'prospect@example.test',
    });

    const retail = await customerService.list(test.ctx, { type: 'retail' });
    expect(retail.items.every((c) => c.type === 'retail')).toBe(true);
    expect(retail.items.some((c) => c.email === 'retail@example.test')).toBe(true);

    const b2b = await customerService.list(test.ctx, { type: 'b2b' });
    expect(b2b.items.every((c) => c.type === 'b2b')).toBe(true);
  });

  it('create — invalid input rolls back atomically (no orphan customer, no event)', async () => {
    // `type: "spaceship"` isn't in the enum — Zod rejects at the service
    // boundary. No row, no event.
    await expect(
      customerService.create(test.ctx, { type: 'spaceship' as never, email: 'bad@example.test' })
    ).rejects.toBeDefined();

    expect(test.publisher.events).toHaveLength(0);

    const { items } = await customerService.list(test.ctx, { q: 'bad@example.test' });
    expect(items).toHaveLength(0);
  });

  it('get — unknown id throws NotFound (no leak of error detail)', async () => {
    await expect(
      customerService.get(test.ctx, '00000000-0000-0000-0000-000000000000')
    ).rejects.toMatchObject({ code: 'NOT_FOUND', entityType: 'Customer' });
  });
});
