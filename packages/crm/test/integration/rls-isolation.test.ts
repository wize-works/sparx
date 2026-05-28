// Cross-tenant RLS isolation — the canonical defensive test.
//
// Two tenants each create a customer with the SAME email. Without the
// (tenant_id, email) UNIQUE the second create would collide; with FORCE
// RLS, the test guarantees neither tenant can read or modify the other's
// row even when they ask for it directly by id.
//
// If this suite starts passing for the wrong reason (e.g. an empty result
// because nothing was inserted), the explicit-id assertions catch it: we
// look the rows up via the service against the OPPOSITE tenant's ctx.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '@sparx/db';
import { customerService, dealService, pipelineService } from '../../src/services/index.js';
import { createTestTenant, dropTestTenant, type TestTenant } from '../helpers.js';

describe('cross-tenant RLS isolation', () => {
  let alice: TestTenant;
  let bob: TestTenant;
  let aliceCtx: { tenantId: string; userId: string };
  let bobCtx: { tenantId: string; userId: string };
  let aliceCustomerId: string;
  let bobCustomerId: string;
  let aliceDealId: string;

  beforeAll(async () => {
    alice = await createTestTenant('owner');
    bob = await createTestTenant('owner');
    aliceCtx = { tenantId: alice.tenantId, userId: alice.userId };
    bobCtx = { tenantId: bob.tenantId, userId: bob.userId };

    // Same email per tenant — relies on @@unique([tenantId, email]) only
    // applying per tenant. If RLS were broken, Alice and Bob's customers
    // would collide on a global UNIQUE that doesn't exist; but if the
    // policy was broken in the OTHER direction, queries would leak rows.
    const a = await customerService.create(aliceCtx, {
      type: 'b2b',
      email: 'shared@example.test',
      firstName: 'Alice-side',
    });
    const b = await customerService.create(bobCtx, {
      type: 'b2b',
      email: 'shared@example.test',
      firstName: 'Bob-side',
    });
    aliceCustomerId = a.id;
    bobCustomerId = b.id;

    // Also exercise a deal — different model, same policy template. Catches
    // policy-drift regressions where one table gets ENABLE but not FORCE.
    const pipeline = await pipelineService.bootstrapDefaultPipeline(aliceCtx);
    const leadStage = pipeline.stages.find((s) => s.name === 'Lead')!;
    const deal = await dealService.create(aliceCtx, {
      pipelineId: pipeline.id,
      stageId: leadStage.id,
      customerId: aliceCustomerId,
      title: 'Alice deal',
      value: 1_000,
    });
    aliceDealId = deal.id;
  });

  afterAll(async () => {
    await dropTestTenant(alice.tenantId);
    await dropTestTenant(bob.tenantId);
  });

  it("Alice's list returns only her own customers", async () => {
    const { items } = await customerService.list(aliceCtx);
    expect(items.map((c) => c.id)).toContain(aliceCustomerId);
    expect(items.map((c) => c.id)).not.toContain(bobCustomerId);
  });

  it("Bob's list returns only his own customers", async () => {
    const { items } = await customerService.list(bobCtx);
    expect(items.map((c) => c.id)).toContain(bobCustomerId);
    expect(items.map((c) => c.id)).not.toContain(aliceCustomerId);
  });

  it("Bob cannot fetch Alice's customer by id (NotFound, not unauthorized)", async () => {
    await expect(customerService.get(bobCtx, aliceCustomerId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      entityType: 'Customer',
    });
  });

  it("Bob cannot update Alice's customer", async () => {
    await expect(
      customerService.update(bobCtx, aliceCustomerId, { firstName: 'pwned' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("Bob cannot soft-delete Alice's customer", async () => {
    await expect(customerService.softDelete(bobCtx, aliceCustomerId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // And Alice's row is still there.
    const stillThere = await customerService.get(aliceCtx, aliceCustomerId);
    expect(stillThere.deletedAt).toBeNull();
  });

  it("Bob cannot fetch Alice's deal", async () => {
    await expect(dealService.get(bobCtx, aliceDealId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      entityType: 'Deal',
    });
  });

  it('a raw query with no tenant GUC set returns zero rows (FORCE RLS sanity)', async () => {
    // No `SET LOCAL app.tenant_id` — current_tenant_id() returns NULL, and
    // every policy evaluates to FALSE. Even though this prisma client has
    // sparx_app's privileges, RLS prevents leakage.
    const rows = await prisma.customer.findMany({});
    expect(rows).toHaveLength(0);
  });
});
