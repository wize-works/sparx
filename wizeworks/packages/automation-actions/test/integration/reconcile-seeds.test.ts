// System-automation seed BACKFILL — reconcileSystemSeeds against a live Postgres
// (docs/84 Slice F2 backfill).
//
// Slice E seeds a module's system automations only on `module.activated` (forward
// only). This proves the daily reconcile pass closes the gap for tenants whose
// module was ALREADY active: it discovers them via the
// find_tenants_with_active_module SECURITY DEFINER scan (run as the worker's
// sparx_app identity) and idempotently installs the module's system automation.
//
// Discovery runs on the sparx_app client (FORCE RLS — the worker's prod
// identity); seeding rides seedSystemAutomations' own withTenant. Setup/asserts
// use a sparx_owner client.

import crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reconcileSystemSeeds } from '../../src/index.js';

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

const createdTenants: string[] = [];

async function makeTenant(opts: { b2bEnabled: boolean }): Promise<string> {
  const slug = `recon-${crypto.randomBytes(4).toString('hex')}`;
  const tenant = await ownerDb.tenant.create({
    data: {
      slug,
      name: slug,
      email: `${slug}@sparx.test`,
      plan: 'starter',
      status: 'active',
      settings: opts.b2bEnabled ? { modules: { b2b: { enabled: true } } } : { modules: {} },
    },
    select: { id: true },
  });
  createdTenants.push(tenant.id);
  return tenant.id;
}

function systemAutomations(tenantId: string) {
  return ownerDb.automation.findMany({ where: { tenantId, origin: 'system' } });
}

beforeAll(async () => {
  // Fail fast with a clear message if docker Postgres isn't up.
  await ownerDb.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  for (const id of createdTenants) {
    await ownerDb.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  await ownerDb.$disconnect();
  await appDb.$disconnect();
});

describe('reconcileSystemSeeds (backfill)', () => {
  it('seeds the B2B automations for a module-active tenant, skips an inactive one', async () => {
    const activeTenant = await makeTenant({ b2bEnabled: true });
    const inactiveTenant = await makeTenant({ b2bEnabled: false });

    // Pre-state: neither tenant has any system automation (Slice E never fired
    // for them — they predate the engine / their activation event was dropped).
    expect(await systemAutomations(activeTenant)).toHaveLength(0);
    expect(await systemAutomations(inactiveTenant)).toHaveLength(0);

    const summary = await reconcileSystemSeeds(appDb);

    // The active tenant now holds the full B2B catalog: the Locked dunning ladder,
    // the no-email onboarding task, and the email-sending defaults (quotes, invoice
    // reminder, account approved, + the two order-approval outcomes) — plus the
    // always-on (`module: null`) seeds, which reconcile installs for every tenant.
    const active = await systemAutomations(activeTenant);
    expect(active.map((a) => a.name).sort()).toEqual([
      'B2B account approved',
      'B2B invoice due reminder',
      'B2B order approved — email',
      'B2B order rejected — email',
      'B2B overdue escalation',
      'B2B quote expiring',
      'B2B quote received',
      'Handle form submissions',
      'New B2B account onboarding task',
    ]);
    const dunning = active.find((a) => a.name === 'B2B overdue escalation');
    expect(dunning?.locked).toBe(true);
    expect(dunning?.status).toBe('active');

    // The b2b-inactive tenant gets NO b2b seed — only the always-on ones, which
    // are deliberately module-independent (any tenant can have a site form).
    const inactive = await systemAutomations(inactiveTenant);
    expect(inactive.map((a) => a.name).sort()).toEqual(['Handle form submissions']);

    // The summary reports a b2b module pass that covered at least our tenant
    // (the cross-tenant scan may also pick up other suites' residue — assert a
    // lower bound, not an exact fleet count).
    const b2b = summary.modules.find((m) => m.module === 'b2b');
    expect(b2b).toBeDefined();
    expect(b2b!.tenants).toBeGreaterThanOrEqual(1);
  });

  it('a tenant that vanished mid-pass is skipped, not fatal', async () => {
    // Discovery and seeding are separate steps, so a tenant can be deleted in the
    // gap between them — the write then fails on `automations_tenant_id_fkey`.
    // Unisolated that took the whole pass down: every tenant AFTER it in the scan
    // silently lost its backfill and the CronJob reported a 500.
    //
    // Reproduced deterministically rather than by racing a delete: a stub `db`
    // hands the pass a dead tenant id ahead of a live one, which is exactly the
    // state the scan leaves behind. Only `$queryRaw` (module discovery) and
    // `tenant.findMany` (always-on) are read off `db` — the seeding writes ride
    // the real client underneath, so the FK violation is genuine.
    const live = await makeTenant({ b2bEnabled: true });
    const dead = '00000000-0000-0000-0000-0000000000ff';

    const warns: object[] = [];
    const stub = {
      // The scan is called once per seed-owning module, with the module slug as the
      // only bound parameter — answer for `b2b` alone so the live tenant ends up
      // with exactly the b2b catalog rather than every module's.
      $queryRaw: (_strings: TemplateStringsArray, module: string) =>
        Promise.resolve(module === 'b2b' ? [{ tenant_id: dead }, { tenant_id: live }] : []),
      tenant: { findMany: () => Promise.resolve([{ id: dead }, { id: live }]) },
    } as unknown as PrismaClient;

    const summary = await reconcileSystemSeeds(stub, {
      info: () => undefined,
      warn: (obj) => warns.push(obj),
    });

    // The live tenant behind the dead one still got its full catalog — the proof
    // that the pass carried on rather than aborting at the first failure.
    expect((await systemAutomations(live)).map((a) => a.name).sort()).toEqual([
      'B2B account approved',
      'B2B invoice due reminder',
      'B2B order approved — email',
      'B2B order rejected — email',
      'B2B overdue escalation',
      'B2B quote expiring',
      'B2B quote received',
      'Handle form submissions',
      'New B2B account onboarding task',
    ]);

    // The skip is REPORTED, not swallowed: one on each pass (module + always-on).
    expect(summary.tenantsSkipped).toBe(2);
    expect(summary.tenantsSeeded).toBe(1);
    expect(summary.modules.find((m) => m.module === 'b2b')?.skipped).toBe(1);
    expect(summary.modules.find((m) => m.module === '(always-on)')?.skipped).toBe(1);
    expect(warns).toHaveLength(2);
  });

  // TWO MINUTES, and the number is not padding. `reconcileSystemSeeds` is global
  // by design — it discovers every tenant with each owning module active and
  // upserts the whole catalog into all of them — so a test of it is O(the entire
  // development database), and this one runs it TWICE. On a dev database that has
  // grown to 111 tenants and 2,230 automations it takes about 30 seconds a pass,
  // which is why it sat on the default 30s limit and failed for anyone whose data
  // had grown. It is not slow because anything is wrong; it is slow because it is
  // measuring the real thing. Raising the ceiling is the honest fix — narrowing
  // the scan to the test tenant would stop the test proving what it is for.
  it('is idempotent — a second reconcile installs no duplicate', async () => {
    const tenantId = await makeTenant({ b2bEnabled: true });

    await reconcileSystemSeeds(appDb);
    await reconcileSystemSeeds(appDb);

    // The eight B2B seeds + the always-on form handler, installed once — a second
    // pass adds no duplicate.
    const rows = await systemAutomations(tenantId);
    expect(rows).toHaveLength(9);
  }, 120_000);
});
