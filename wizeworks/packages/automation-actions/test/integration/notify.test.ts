// `platform.notify` end-to-end on the real engine (docs/124 Phase 3). Proves the
// whole awareness-layer chain a user actually depends on:
//
//   domain event → automation.trigger → engine tick → platform.notify
//                → Notification rows, one per person in the audience
//
// The unit tests cover `fill()` and the audience map in isolation; what they
// CANNOT show is that the seeded rule is reachable — that the event type has a
// registered resolver, that the field paths in the seed's template match what the
// resolver actually emits, and that the row lands unread and tenant-scoped. Every
// one of those is a seam between two files that typecheck independently.
//
// Ticks run on sparx_app (the worker's identity, FORCE RLS); setup and asserts
// use sparx_owner, exactly like the sibling seed suites.

import crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import {
  handleTrigger,
  installBuiltins,
  runAutomationTick,
  type EngineDeps,
  type TriggerEnvelope,
} from '@wizeworks/automation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installModuleActions, seedSystemAutomations } from '../../src/index.js';

const ownerDb = new PrismaClient({
  datasourceUrl:
    process.env.MIGRATION_DATABASE_URL ??
    'postgresql://sparx_owner:devpassword@localhost:5544/sparx?schema=public',
});
const appDb = new PrismaClient({
  datasourceUrl:
    process.env.DATABASE_URL ??
    'postgresql://sparx_app:devpassword@localhost:5544/sparx?schema=public',
});

const noop = (): void => undefined;
const deps: EngineDeps = {
  publisher: { publish: () => Promise.resolve() },
  logger: { debug: noop, info: noop, warn: noop, error: noop },
};

const createdTenants: string[] = [];

/** A tenant with commerce on, one owner, and `staff` extra members by role. */
async function seedTenant(roles: string[] = []): Promise<{ tenantId: string; ownerId: string }> {
  const slug = `notify-${crypto.randomBytes(5).toString('hex')}`;
  const tenant = await ownerDb.tenant.create({
    data: {
      slug,
      name: slug,
      email: `${slug}@sparx.test`,
      plan: 'starter',
      status: 'active',
      settings: { modules: { commerce: { enabled: true } } },
    },
    select: { id: true },
  });
  createdTenants.push(tenant.id);
  const owner = await ownerDb.user.create({
    data: {
      tenantId: tenant.id,
      email: `${slug}-owner@sparx.test`,
      name: 'Owner',
      role: 'owner',
    },
    select: { id: true },
  });
  for (const [i, role] of roles.entries()) {
    await ownerDb.user.create({
      data: {
        tenantId: tenant.id,
        email: `${slug}-${role}-${i}@sparx.test`,
        name: role,
        role,
      },
    });
  }
  return { tenantId: tenant.id, ownerId: owner.id };
}

async function seedOrder(tenantId: string, orderNumber: string): Promise<string> {
  const customer = await ownerDb.customer.create({
    data: { tenantId, type: 'retail', email: `buyer-${orderNumber}@sparx.test` },
    select: { id: true },
  });
  const order = await ownerDb.order.create({
    data: {
      tenantId,
      customerId: customer.id,
      orderNumber,
      status: 'placed',
      total: 250,
      subtotal: 250,
      placedAt: new Date(),
    },
    select: { id: true },
  });
  return order.id;
}

function evt(type: string, tenantId: string, data: Record<string, unknown>): TriggerEnvelope {
  return { type, tenantId, actorId: null, occurredAt: new Date().toISOString(), data };
}

beforeAll(() => {
  installBuiltins();
  installModuleActions();
});

afterAll(async () => {
  for (const id of createdTenants) {
    await ownerDb.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  await ownerDb.$disconnect();
  await appDb.$disconnect();
});

describe('payment failed → in-app notification', () => {
  it('writes an unread, addressed notification to the owner', async () => {
    const { tenantId, ownerId } = await seedTenant();
    await seedSystemAutomations({ tenantId }, { module: 'commerce' });
    const orderId = await seedOrder(tenantId, 'SO-901');

    await handleTrigger(evt('order.payment_failed', tenantId, { orderId }), deps);
    await runAutomationTick(deps, appDb);

    expect(await ownerDb.notification.count({ where: { tenantId } })).toBe(1);
    const n = await ownerDb.notification.findFirstOrThrow({ where: { tenantId } });
    expect(n.userId).toBe(ownerId);
    expect(n.readAt).toBeNull(); // arrives unread, or the bell never rings
    expect(n.kind).toBe('order.payment_failed');
    expect(n.severity).toBe('danger');
    expect(n.module).toBe('commerce');
    // LOWERCASE, and that is the whole point of the field. `entityType` is not a
    // label — it is the key `routeForEntity` looks up in @wizeworks/links to work
    // out where the notification LEADS, and every one of the 28 entity keys there
    // is lowercase (`order`, `gift_card`, `cms_page`). Asserting 'Order' asked the
    // seed to write a value that resolves to nothing, which would turn the bell
    // back into the dead end it used to be.
    expect(n.entityType).toBe('order');
  });

  it('interpolates the order number into the title', async () => {
    // The seam this suite exists for: the seed template says `{{order.number}}`,
    // and only a real run proves the event has a resolver emitting that exact
    // path. A missing resolver degrades SILENTLY to an empty string, so asserting
    // the number is present is what catches it.
    const { tenantId } = await seedTenant();
    await seedSystemAutomations({ tenantId }, { module: 'commerce' });
    const orderId = await seedOrder(tenantId, 'SO-902');

    await handleTrigger(evt('order.payment_failed', tenantId, { orderId }), deps);
    await runAutomationTick(deps, appDb);

    const n = await ownerDb.notification.findFirstOrThrow({ where: { tenantId } });
    expect(n.title).toBe('Payment failed on order SO-902');
    expect(n.title).not.toContain('{{');
    expect(n.body).toBeTruthy();
  });

  it('addresses the audience by ROLE — owners only, not every staff member', async () => {
    // `audience: 'owners'` is the seed's blast radius. An admin and an editor in
    // the same tenant must NOT be notified, or the bell becomes noise for people
    // who cannot act on it.
    const { tenantId, ownerId } = await seedTenant(['admin', 'editor']);
    await seedSystemAutomations({ tenantId }, { module: 'commerce' });
    const orderId = await seedOrder(tenantId, 'SO-903');

    await handleTrigger(evt('order.payment_failed', tenantId, { orderId }), deps);
    await runAutomationTick(deps, appDb);

    const rows = await ownerDb.notification.findMany({ where: { tenantId } });
    expect(rows.map((r) => r.userId)).toEqual([ownerId]);
  });

  it('does not leak across tenants', async () => {
    // RLS is the backstop, but the action also resolves recipients through the
    // tenant-scoped tx — this proves a payment failure in one tenant writes
    // nothing into a bystander tenant that has the same rule installed.
    const a = await seedTenant();
    const b = await seedTenant();
    await seedSystemAutomations({ tenantId: a.tenantId }, { module: 'commerce' });
    await seedSystemAutomations({ tenantId: b.tenantId }, { module: 'commerce' });
    const orderId = await seedOrder(a.tenantId, 'SO-904');

    await handleTrigger(evt('order.payment_failed', a.tenantId, { orderId }), deps);
    await runAutomationTick(deps, appDb);

    expect(await ownerDb.notification.count({ where: { tenantId: a.tenantId } })).toBe(1);
    expect(await ownerDb.notification.count({ where: { tenantId: b.tenantId } })).toBe(0);
  });
});

describe('out of stock → in-app notification', () => {
  it('notifies on inventory.depleted with the product title filled in', async () => {
    // A second event family through the same action, because the seeds resolve
    // their fields from DIFFERENT resolvers (order vs. inventory) — one working
    // says nothing about the other.
    const { tenantId } = await seedTenant();
    await ownerDb.tenant.update({
      where: { id: tenantId },
      data: { settings: { modules: { inventory: { enabled: true } } } },
    });
    await seedSystemAutomations({ tenantId }, { module: 'inventory' });

    const product = await ownerDb.product.create({
      data: {
        tenantId,
        title: 'Trail Runner 40L Pack',
        handle: `p-${crypto.randomBytes(4).toString('hex')}`,
        status: 'active',
      },
      select: { id: true },
    });
    const variant = await ownerDb.productVariant.create({
      data: {
        tenantId,
        productId: product.id,
        sku: `SKU-${crypto.randomBytes(3).toString('hex')}`,
        priceCents: 12_900,
        currency: 'USD',
      },
      select: { id: true },
    });

    await handleTrigger(
      evt('inventory.depleted', tenantId, { variantId: variant.id, onHand: 0 }),
      deps
    );
    await runAutomationTick(deps, appDb);

    const n = await ownerDb.notification.findFirstOrThrow({ where: { tenantId } });
    expect(n.title).toBe('Trail Runner 40L Pack is out of stock');
    expect(n.severity).toBe('warning');
    expect(n.kind).toBe('inventory.depleted');
  });
});
