// Email system seeds (docs/90 Step 4) on the real engine — the ENQUEUE side of the
// send-by-key contract. Proves:
//   1. The welcome seed fires on crm.customer.created and writes a ScheduledSend
//      whose body is a `defer` reference to the 'welcome-customer' template by KEY
//      (resolved to the tenant's published tree at DISPATCH — that half lives in
//      api-rest's email-dispatch send-by-key test), carrying the firing customer's
//      entityRefs + the declared transactional emailType.
//   2. The email MODULE gate — a CRM-only tenant records the send as `gated`
//      (docs/90 §4) and enqueues nothing until email activates.
//   3. The suppression SCOPE follows emailType — a `transactional` campaign
//      (welcome) is NOT withheld by a marketing-scope unsubscribe; a `marketing`
//      campaign (win-back) is.
//
// Ticks run on sparx_app (the worker's identity); seeding/asserts use sparx_owner.

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

async function seedTenant(modules: string[]): Promise<string> {
  const slug = `seedmail-${crypto.randomBytes(5).toString('hex')}`;
  const settings = { modules: Object.fromEntries(modules.map((m) => [m, { enabled: true }])) };
  const tenant = await ownerDb.tenant.create({
    data: {
      slug,
      name: slug,
      email: `${slug}@sparx.test`,
      plan: 'starter',
      status: 'active',
      settings,
    },
    select: { id: true },
  });
  createdTenants.push(tenant.id);
  return tenant.id;
}

async function makeCustomer(
  tenantId: string,
  email: string
): Promise<{ id: string; email: string }> {
  const c = await ownerDb.customer.create({
    data: { tenantId, type: 'retail', email },
    select: { id: true },
  });
  return { id: c.id, email };
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

describe('welcome seed — send by key', () => {
  it('fires on crm.customer.created and enqueues a defer.builderEmailKey send', async () => {
    const tenantId = await seedTenant(['crm', 'email']);
    await seedSystemAutomations({ tenantId }, { module: 'crm' });
    const { id: customerId, email } = await makeCustomer(tenantId, 'buyer@sparx.test');

    await handleTrigger(evt('crm.customer.created', tenantId, { customerId }), deps, appDb);
    await runAutomationTick(deps, appDb);

    const send = await ownerDb.scheduledSend.findFirst({ where: { tenantId } });
    expect(send?.recipient).toBe(email);
    expect(send?.customerId).toBe(customerId);
    // The body references the template by KEY (not a per-tenant id) + declares its
    // transactional intent — resolved + gate-checked at dispatch.
    const payload = send?.payload as {
      defer?: { builderEmailKey?: string; emailType?: string };
    } | null;
    expect(payload?.defer?.builderEmailKey).toBe('welcome-customer');
    expect(payload?.defer?.emailType).toBe('transactional');
    // entityRefs name the firing customer for the deferred per-recipient render.
    const refs = send?.entityRefs as { customerId?: string } | null;
    expect(refs?.customerId).toBe(customerId);
  });
});

describe('email module gate', () => {
  it('records the send as gated (enqueues nothing) when email is inactive', async () => {
    const tenantId = await seedTenant(['crm']); // email NOT active
    await seedSystemAutomations({ tenantId }, { module: 'crm' });
    const { id: customerId } = await makeCustomer(tenantId, 'nobody@sparx.test');

    await handleTrigger(evt('crm.customer.created', tenantId, { customerId }), deps, appDb);
    await runAutomationTick(deps, appDb);

    // Nothing enqueued — but the run COMPLETES with the send step recorded `gated`
    // (the conversion nudge in run history, docs/90 §4), not failed.
    expect(await ownerDb.scheduledSend.count({ where: { tenantId } })).toBe(0);
    const run = await ownerDb.automationRun.findFirst({
      where: { tenantId },
      include: { steps: true },
    });
    expect(run?.status).toBe('completed');
    expect(run?.steps.some((s) => s.status === 'gated')).toBe(true);
  });
});

describe('suppression scope follows emailType', () => {
  it('a transactional campaign ignores a marketing unsubscribe; a marketing one honors it', async () => {
    const tenantId = await seedTenant(['crm', 'email']);
    await seedSystemAutomations({ tenantId }, { module: 'crm' });
    const { id: customerId, email } = await makeCustomer(tenantId, 'optout@sparx.test');
    // The recipient unsubscribed from MARKETING only.
    await ownerDb.emailSuppression.create({
      data: { tenantId, email: email.toLowerCase(), scope: 'marketing', reason: 'unsubscribe' },
    });

    // welcome (transactional) → still enqueues despite the marketing opt-out.
    await handleTrigger(evt('crm.customer.created', tenantId, { customerId }), deps, appDb);
    await runAutomationTick(deps, appDb);
    expect(await ownerDb.scheduledSend.count({ where: { tenantId } })).toBe(1);

    // An ad-hoc MARKETING campaign to the same recipient → suppressed (no row).
    await ownerDb.automation.create({
      data: {
        tenantId,
        name: 'Promo',
        status: 'active',
        triggerType: 'crm.customer.subscribed',
        triggerConfig: {},
        conditions: { logic: 'AND', conditions: [] },
        actions: [
          {
            type: 'email.send_campaign',
            config: { builderEmailKey: 'win-back', emailType: 'marketing' },
          },
        ],
        origin: 'user',
        maxDepth: 3,
      },
    });
    await handleTrigger(evt('crm.customer.subscribed', tenantId, { customerId }), deps, appDb);
    await runAutomationTick(deps, appDb);

    // Still just the one welcome send — the marketing promo was suppressed.
    expect(await ownerDb.scheduledSend.count({ where: { tenantId } })).toBe(1);
  });
});

// The shipping confirmation, and the parcel it is about. Both halves were broken
// together: the `shipping-confirmation` tree was provisioned and published on every
// shop with NO automation naming it (the only listener on `order.fulfilled` was the
// review request, which waits three days and then asks how they liked a parcel they
// were never told about), and the order events dropped `fulfillmentId` on the floor,
// so even a correct send would have resolved its tracking details from "the latest
// parcel on this order" — the wrong box the moment an order ships in two.
describe('shipping confirmation seed — the parcel, not just the order', () => {
  it('sends on order.fulfilled and names the parcel that shipped', async () => {
    const tenantId = await seedTenant(['commerce', 'email']);
    await seedSystemAutomations({ tenantId }, { module: 'commerce' });
    const { id: customerId, email } = await makeCustomer(tenantId, 'shipped@sparx.test');

    const order = await ownerDb.order.create({
      data: {
        tenantId,
        customerId,
        orderNumber: 'SO-900',
        status: 'placed',
        total: 140,
        subtotal: 140,
        placedAt: new Date(),
      },
      select: { id: true },
    });
    // TWO parcels, the second one newest. A send that reads "latest fulfillment on
    // the order" would report this one's tracking number for both emails.
    await ownerDb.orderFulfillment.create({
      data: {
        tenantId,
        orderId: order.id,
        status: 'shipped',
        carrier: 'USPS',
        trackingNumber: 'FIRST-BOX',
        shippedAt: new Date(Date.now() - 60_000),
      },
    });
    const second = await ownerDb.orderFulfillment.create({
      data: {
        tenantId,
        orderId: order.id,
        status: 'shipped',
        carrier: 'USPS',
        trackingNumber: 'SECOND-BOX',
        shippedAt: new Date(),
      },
      select: { id: true },
    });

    await handleTrigger(
      evt('order.fulfilled', tenantId, { orderId: order.id, fulfillmentId: second.id }),
      deps,
      appDb
    );
    await runAutomationTick(deps, appDb);

    // TWO sends leave on this one event, and picking them apart is the point: the
    // review request has always fired here, which is exactly how the missing
    // confirmation stayed hidden — something did go out, just never the one that
    // says the parcel is on its way.
    const sends = await ownerDb.scheduledSend.findMany({ where: { tenantId } });
    const keyOf = (s: (typeof sends)[number]): string | undefined =>
      (s.payload as { defer?: { builderEmailKey?: string } } | null)?.defer?.builderEmailKey;
    expect(sends.map(keyOf).sort()).toEqual(['post-purchase-review', 'shipping-confirmation']);

    const shipping = sends.find((s) => keyOf(s) === 'shipping-confirmation');
    expect(shipping?.recipient).toBe(email);

    // The refs carry the FIRING parcel, so the dispatch render reads that box's
    // tracking number rather than falling back to whichever shipped most recently.
    const refs = shipping?.entityRefs as { orderId?: string; fulfillmentId?: string } | null;
    expect(refs?.orderId).toBe(order.id);
    expect(refs?.fulfillmentId).toBe(second.id);
  });
});

// A COLLECTION is not a despatch, and the difference is invisible from the
// event. Walking out of the shop with your order is recorded as a fulfillment
// carried by `pickup`, and it publishes `order.fulfilled` exactly like a posted
// parcel — deliberately, so the activity feed and the review request see the sale
// complete. The shipping confirmation must not ride along with them: "Your order
// is on its way — track your package" is plainly false to somebody already
// holding the goods.
describe('shipping confirmation seed — a collection is not a despatch', () => {
  it('sends no shipping confirmation when the customer collected it', async () => {
    const tenantId = await seedTenant(['commerce', 'email']);
    await seedSystemAutomations({ tenantId }, { module: 'commerce' });
    const { id: customerId } = await makeCustomer(tenantId, 'collector@sparx.test');

    const order = await ownerDb.order.create({
      data: {
        tenantId,
        customerId,
        orderNumber: 'SO-COLLECT',
        status: 'fulfilled',
        total: 96,
        subtotal: 96,
        placedAt: new Date(),
      },
      select: { id: true },
    });
    const collected = await ownerDb.orderFulfillment.create({
      data: {
        tenantId,
        orderId: order.id,
        status: 'delivered',
        carrier: 'pickup',
        service: 'Collect in person',
        deliveredAt: new Date(),
      },
      select: { id: true },
    });

    await handleTrigger(
      evt('order.fulfilled', tenantId, { orderId: order.id, fulfillmentId: collected.id }),
      deps,
      appDb
    );
    await runAutomationTick(deps, appDb);

    const sends = await ownerDb.scheduledSend.findMany({ where: { tenantId } });
    const keys = sends.map(
      (s) => (s.payload as { defer?: { builderEmailKey?: string } } | null)?.defer?.builderEmailKey
    );
    expect(keys).not.toContain('shipping-confirmation');
    // The review request still goes: the sale IS complete, and asking how it was
    // is right whether they collected it or it arrived by post.
    expect(keys).toContain('post-purchase-review');
  });
});
