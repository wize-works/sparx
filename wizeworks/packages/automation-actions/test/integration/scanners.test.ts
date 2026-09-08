// Scheduled scanners + the `interval` cadence — END-TO-END on the real engine
// (docs/90 ADR Step 1). Drives `runScheduleTick`: scan an entity → enqueue ONE
// run per matched row, deduped. Two things under test that the rest of the
// baked-in catalog leans on:
//
//   1. The new `interval` cadence dedupes ONCE PER ENTITY (a transient row fires a
//      single run, never re-firing each interval) — proven with the built-in
//      `customer` scanner so the seeding stays minimal.
//   2. The new `billing_document` scanner returns the right rows with the right
//      resolved fields — `daysUntilDue` is COMPUTED from `dueAt`, paid/void docs
//      are excluded — which the invoicing dunning seeds select on.
//
// Ticks run on the sparx_app client (the worker's prod identity, FORCE RLS);
// seeding/asserts use a sparx_owner client. We assert at the ENQUEUE level (the
// schedule tick creates the run; the gated dispatcher is a separate concern), so
// no module gate or action executor is needed — a `platform.stop` action keeps
// the automation valid without an effect.

import crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import {
  installBuiltins,
  runScheduleTick,
  upsertSystemAutomation,
  type EngineDeps,
  type ServiceCtx,
  type SystemAutomationSpec,
} from '@wizeworks/automation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installEntityResolvers } from '../../src/index.js';
import { INVOICING_REMINDER_3D } from '../../src/seeds/invoicing.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

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

async function createTenant(): Promise<string> {
  const slug = `scan-${crypto.randomBytes(4).toString('hex')}`;
  const t = await ownerDb.tenant.create({
    data: { slug, name: slug, email: `${slug}@sparx.test`, plan: 'starter', status: 'active' },
    select: { id: true },
  });
  createdTenants.push(t.id);
  return t.id;
}

/** Count the runs a given automation has enqueued (its own dedupe namespace). */
function runCount(automationId: string): Promise<number> {
  return ownerDb.automationRun.count({ where: { automationId } });
}

beforeAll(() => {
  installBuiltins();
  installEntityResolvers();
});

afterAll(async () => {
  for (const id of createdTenants) {
    await ownerDb.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  await ownerDb.$disconnect();
  await appDb.$disconnect();
});

describe('interval cadence — once-per-entity dedupe', () => {
  const spec: SystemAutomationSpec = {
    name: 'Test interval customer scan',
    description: 'Fires once per customer regardless of how often the interval ticks.',
    trigger: {
      kind: 'schedule',
      // everyMinutes: 1 ⇒ due on every minute boundary (always due in a test).
      schedule: { cadence: 'interval', everyMinutes: 1 },
      predicate: { entity: 'customer', where: { logic: 'AND', conditions: [] } },
    },
    conditions: { logic: 'AND', conditions: [] },
    actions: [{ type: 'platform.stop', config: { reason: 'test' } }],
    locked: false,
    status: 'active',
  };

  it('enqueues exactly one run per entity and never re-fires on a later tick', async () => {
    const tenantId = await createTenant();
    const ctx: ServiceCtx = { tenantId };
    await ownerDb.customer.create({
      data: { tenantId, type: 'retail', email: 'cold@example.com', firstName: 'Cole' },
    });
    const auto = await upsertSystemAutomation(ctx, spec);

    await runScheduleTick(deps, appDb);
    expect(await runCount(auto.id)).toBe(1);

    // A second tick (a later interval) must NOT enqueue a duplicate — the interval
    // window key is stable, so the (automation_id, dedupe_key) UNIQUE collapses it.
    await runScheduleTick(deps, appDb, new Date(Date.now() + 30 * 60_000));
    expect(await runCount(auto.id)).toBe(1);
  });
});

describe('billing_document scanner', () => {
  async function seedInvoice(opts: {
    tenantId: string;
    dueInDays: number;
    status: string;
    /** When the send route emailed it. Undefined = never sent, which is the
     *  ordinary state of an invoice somebody just raised. */
    sentAt?: string;
  }): Promise<string> {
    const { tenantId } = opts;
    // The issuing site — `propertyId` is required on a billing document (docs/131
    // §3.6); every invoice is issued by a property.
    const property = await ownerDb.property.create({
      data: {
        tenantId,
        slug: `scan-${crypto.randomBytes(3).toString('hex')}`,
        name: 'Site',
        isPrimary: true,
      },
      select: { id: true },
    });
    const customer = await ownerDb.customer.create({
      data: { tenantId, type: 'b2b', email: 'ar@example.com', firstName: 'Ada' },
      select: { id: true },
    });
    const workflow = await ownerDb.documentWorkflow.create({
      data: {
        tenantId,
        name: 'Invoices',
        slug: `inv-${crypto.randomBytes(3).toString('hex')}`,
        sortOrder: 0,
        stages: {
          create: [
            {
              tenantId,
              name: 'Invoice',
              customerLabel: 'Invoice',
              stageType: 'final',
              sortOrder: 0,
            },
          ],
        },
      },
      include: { stages: true },
    });
    const doc = await ownerDb.billingDocument.create({
      data: {
        tenantId,
        propertyId: property.id,
        workflowId: workflow.id,
        stageId: workflow.stages[0]!.id,
        customerId: customer.id,
        number: `INV-${crypto.randomBytes(3).toString('hex')}`,
        currency: 'USD',
        subtotal: 500,
        total: 500,
        balance: 500,
        status: opts.status,
        // + 12h so the floor lands on exactly `dueInDays`.
        dueAt: new Date(Date.now() + opts.dueInDays * DAY + 12 * HOUR),
        finalizedAt: new Date(),
        // The send route records the send here; there is no column.
        metadata: opts.sentAt ? { sentAt: opts.sentAt, sentTo: 'ar@example.com' } : {},
      },
      select: { id: true },
    });
    return doc.id;
  }

  function dueInThreeSpec(): SystemAutomationSpec {
    return {
      name: 'Test invoice due in 3',
      description: 'Selects a billing document due in exactly 3 days.',
      trigger: {
        kind: 'schedule',
        schedule: { cadence: 'daily', atMinuteUtc: 0 },
        predicate: {
          entity: 'billing_document',
          where: {
            logic: 'AND',
            conditions: [{ field: 'invoice.daysUntilDue', operator: 'eq', value: 3 }],
          },
        },
      },
      conditions: { logic: 'AND', conditions: [] },
      actions: [{ type: 'platform.stop', config: { reason: 'test' } }],
      locked: false,
      status: 'active',
    };
  }

  it('enqueues a run for a document due in 3 days with the resolved invoice fields', async () => {
    const tenantId = await createTenant();
    const ctx: ServiceCtx = { tenantId };
    const docId = await seedInvoice({ tenantId, dueInDays: 3, status: 'unpaid' });
    const auto = await upsertSystemAutomation(ctx, dueInThreeSpec());

    await runScheduleTick(deps, appDb);
    expect(await runCount(auto.id)).toBe(1);

    // The synthesized run carries the scanned snapshot — the dunning email reads
    // `invoice.number` / `invoice.daysUntilDue` off it.
    const run = await ownerDb.automationRun.findFirstOrThrow({ where: { automationId: auto.id } });
    const fields = (
      run.triggerEvent as { data?: { entityId?: string; __fields?: Record<string, unknown> } }
    ).data;
    expect(fields?.entityId).toBe(docId);
    expect(fields?.__fields?.['invoice.daysUntilDue']).toBe(3);
    expect(fields?.__fields?.['customer.email']).toBe('ar@example.com');
  });

  it('excludes a paid document (no run enqueued)', async () => {
    const tenantId = await createTenant();
    const ctx: ServiceCtx = { tenantId };
    await seedInvoice({ tenantId, dueInDays: 3, status: 'paid' });
    const auto = await upsertSystemAutomation(ctx, dueInThreeSpec());

    await runScheduleTick(deps, appDb);
    expect(await runCount(auto.id)).toBe(0);
  });

  // ── NEVER CHASE A BILL THE CUSTOMER WAS NEVER GIVEN ─────────────────────
  //
  // These two drive the REAL shipped seed rather than a copy of it, because the
  // thing under test is the seed's own predicate. Making an invoice and sending
  // it are two acts, and this ladder keyed on the due date alone: an owner who
  // raised an invoice and had not yet emailed it — the normal state of an
  // invoice while a deadline is set and a line is checked — had her customer
  // sent a friendly reminder about a bill they had never seen, then an overdue
  // notice, then a second, then a final one.
  //
  // The pair is the point. Removing `WAS_SENT` from the seed turns the first
  // one red while the second stays green, so the guard cannot rot into a
  // condition that is always true.
  describe('the dunning ladder', () => {
    it('does not chase an invoice that was never sent', async () => {
      const tenantId = await createTenant();
      const ctx: ServiceCtx = { tenantId };
      await seedInvoice({ tenantId, dueInDays: 3, status: 'unpaid' });
      const auto = await upsertSystemAutomation(ctx, INVOICING_REMINDER_3D);

      await runScheduleTick(deps, appDb);
      expect(await runCount(auto.id)).toBe(0);
    });

    it('chases the same invoice once the customer has been given it', async () => {
      const tenantId = await createTenant();
      const ctx: ServiceCtx = { tenantId };
      const docId = await seedInvoice({
        tenantId,
        dueInDays: 3,
        status: 'unpaid',
        sentAt: new Date().toISOString(),
      });
      const auto = await upsertSystemAutomation(ctx, INVOICING_REMINDER_3D);

      await runScheduleTick(deps, appDb);
      expect(await runCount(auto.id)).toBe(1);

      const run = await ownerDb.automationRun.findFirstOrThrow({
        where: { automationId: auto.id },
      });
      const data = (
        run.triggerEvent as { data?: { entityId?: string; __fields?: Record<string, unknown> } }
      ).data;
      expect(data?.entityId).toBe(docId);
      expect(data?.__fields?.['invoice.sentAt']).toBeTruthy();
    });
  });
});
