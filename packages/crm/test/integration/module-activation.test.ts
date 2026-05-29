// Tenant-activation bootstrap.
//
// On `module.activated` for crm, the consumer must:
//   1. Seed the default sales pipeline + its 6 stages (idempotent).
//   2. Seed all built-in segment templates (idempotent, isBuiltIn=true).
//   3. Drop the module-gate cache so subsequent consumers see the new
//      enabled-state.
//   4. Ignore activations for other modules (cms, commerce, etc).

import crypto from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { withTenant } from '@sparx/db';
import { BUILT_IN_SEGMENT_TEMPLATES, DEFAULT_PIPELINE_TEMPLATE } from '@sparx/crm-schemas/builtins';
import {
  registerCrmConsumers,
  resetDedupeForTesting,
  resetPlatformBusForTesting,
  type PlatformEventBus,
} from '../../src/index.js';
import { createTestTenant, dropTestTenant, type TestTenant } from '../helpers.js';

describe('CRM module activation bootstrap', () => {
  let bus: PlatformEventBus;
  let teardown: () => void;
  let tenant: TestTenant;

  beforeAll(async () => {
    bus = resetPlatformBusForTesting();
    resetDedupeForTesting();
    const registration = registerCrmConsumers({ bus });
    teardown = () => registration.unregister();
    tenant = await createTestTenant('owner');
  });

  afterAll(async () => {
    teardown();
    await dropTestTenant(tenant.tenantId);
  });

  beforeEach(() => {
    resetDedupeForTesting();
  });

  async function publishActivated(module: string): Promise<void> {
    await bus.publish({
      id: crypto.randomUUID(),
      topic: 'module.activated',
      tenantId: tenant.tenantId,
      occurredAt: new Date(),
      payload: { module },
    });
    await bus.drain();
  }

  it('seeds the default pipeline and built-in segments on activation', async () => {
    await publishActivated('crm');

    const ctx = { tenantId: tenant.tenantId };
    const pipeline = await withTenant(ctx, (tx) =>
      tx.pipeline.findUnique({
        where: {
          tenantId_slug: { tenantId: tenant.tenantId, slug: DEFAULT_PIPELINE_TEMPLATE.slug },
        },
        include: { stages: true },
      })
    );
    expect(pipeline).not.toBeNull();
    expect(pipeline?.isDefault).toBe(true);
    expect(pipeline?.stages.length).toBe(DEFAULT_PIPELINE_TEMPLATE.stages.length);

    const segments = await withTenant(ctx, (tx) =>
      tx.segment.findMany({
        where: { isBuiltIn: true },
        orderBy: { slug: 'asc' },
      })
    );
    expect(segments.length).toBe(BUILT_IN_SEGMENT_TEMPLATES.length);
    const slugs = segments.map((s) => s.slug).sort();
    const expected = BUILT_IN_SEGMENT_TEMPLATES.map((t) => t.slug).sort();
    expect(slugs).toEqual(expected);
    expect(segments.every((s) => s.isSystem)).toBe(true);
  });

  it('is idempotent — a second activation does not duplicate rows', async () => {
    await publishActivated('crm');
    await publishActivated('crm');

    const ctx = { tenantId: tenant.tenantId };
    const pipelineCount = await withTenant(ctx, (tx) =>
      tx.pipeline.count({ where: { slug: DEFAULT_PIPELINE_TEMPLATE.slug } })
    );
    expect(pipelineCount).toBe(1);

    const segmentCount = await withTenant(ctx, (tx) =>
      tx.segment.count({ where: { isBuiltIn: true } })
    );
    expect(segmentCount).toBe(BUILT_IN_SEGMENT_TEMPLATES.length);
  });

  it('ignores activations for other modules', async () => {
    const ctx = { tenantId: tenant.tenantId };
    // Wipe everything seeded so far so this case starts clean.
    await withTenant(ctx, async (tx) => {
      await tx.segment.deleteMany({});
      await tx.pipeline.deleteMany({});
    });

    await publishActivated('cms');
    await publishActivated('commerce');

    const pipelineCount = await withTenant(ctx, (tx) => tx.pipeline.count({}));
    const segmentCount = await withTenant(ctx, (tx) => tx.segment.count({}));
    expect(pipelineCount).toBe(0);
    expect(segmentCount).toBe(0);
  });
});
