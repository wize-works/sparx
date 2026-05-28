// dealService — the load-bearing test is that moveStage() is the ONLY path
// that emits crm.deal.stage_changed, and that calling update() with a
// stageId is rejected outright. The email module's automation engine
// subscribes to that topic; if we ever silently double-publish or skip it,
// templated emails fail in production.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  customerService,
  dealService,
  pipelineService,
} from '../../src/services/index.js';
import {
  disposeTestContext,
  makeTestContext,
  type TestContext,
} from '../helpers.js';

describe('dealService', () => {
  let test: TestContext;
  let pipelineId: string;
  let leadStageId: string;
  let qualifiedStageId: string;
  let wonStageId: string;
  let lostStageId: string;
  let customerId: string;

  beforeAll(async () => {
    test = await makeTestContext('owner');

    // Bootstrap the default pipeline — gives us a real set of stages with
    // both 'open' and terminal 'won'/'lost' types so we can assert the
    // closedAt + closedReason behaviour on terminal moves.
    const pipeline = await pipelineService.bootstrapDefaultPipeline(test.ctx);
    pipelineId = pipeline.id;
    leadStageId = pipeline.stages.find((s) => s.name === 'Lead')!.id;
    qualifiedStageId = pipeline.stages.find((s) => s.name === 'Qualified')!.id;
    wonStageId = pipeline.stages.find((s) => s.name === 'Closed Won')!.id;
    lostStageId = pipeline.stages.find((s) => s.name === 'Closed Lost')!.id;

    const customer = await customerService.create(test.ctx, {
      type: 'b2b',
      email: 'buyer@acmefleet.test',
      company: 'Acme Fleet',
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  beforeEach(() => {
    test.publisher.clear();
  });

  it('create — drops a deal.created activity in the same transaction', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Q3 fleet contract',
      value: 25_000,
      probability: 10,
    });

    expect(deal.title).toBe('Q3 fleet contract');
    expect(deal.stageId).toBe(leadStageId);
    expect(deal.closedAt).toBeNull();

    // Event: crm.deal.created exactly once.
    expect(
      test.publisher.events.filter((e) => e.topic === 'crm.deal.created'),
    ).toHaveLength(1);
  });

  it('moveStage — fires crm.deal.stage_changed with from/to payload', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Move test',
      value: 5_000,
    });
    test.publisher.clear();

    const moved = await dealService.moveStage(test.ctx, deal.id, {
      toStageId: qualifiedStageId,
    });

    expect(moved.stageId).toBe(qualifiedStageId);

    // crm.deal.stage_changed fired exactly once.
    const changes = test.publisher.events.filter(
      (e) => e.topic === 'crm.deal.stage_changed',
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.payload).toMatchObject({
      dealId: deal.id,
      fromStageId: leadStageId,
      toStageId: qualifiedStageId,
      closed: false,
    });
  });

  it('moveStage to won — sets closedAt and fires both stage_changed and closed', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Win test',
      value: 12_000,
    });
    test.publisher.clear();

    const moved = await dealService.moveStage(test.ctx, deal.id, {
      toStageId: wonStageId,
      closedReason: 'Signed PO',
    });

    expect(moved.closedAt).not.toBeNull();
    expect(moved.closedReason).toBe('Signed PO');

    // Both events fire — stage_changed AND closed. The email module's
    // automation engine wants both signals (one targets stage rules, one
    // targets deal-lifecycle rules).
    const topics = test.publisher.events.map((e) => e.topic);
    expect(topics).toContain('crm.deal.stage_changed');
    expect(topics).toContain('crm.deal.closed');
  });

  it('moveStage to lost — sets closedAt and fires closed event', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Lost test',
      value: 8_000,
    });
    test.publisher.clear();

    const moved = await dealService.moveStage(test.ctx, deal.id, {
      toStageId: lostStageId,
      closedReason: 'Went with competitor',
    });

    expect(moved.closedAt).not.toBeNull();
    expect(
      test.publisher.events.find((e) => e.topic === 'crm.deal.closed')?.payload,
    ).toMatchObject({ outcome: 'lost' });
  });

  it('moveStage no-op — moving to the current stage does NOT emit', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Idempotent test',
      value: 1_000,
    });
    test.publisher.clear();

    await dealService.moveStage(test.ctx, deal.id, { toStageId: leadStageId });

    expect(
      test.publisher.events.filter((e) => e.topic === 'crm.deal.stage_changed'),
    ).toHaveLength(0);
  });

  it('update — rejects stageId field (must use moveStage)', async () => {
    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Update guardrail',
      value: 1_000,
    });

    await expect(
      dealService.update(test.ctx, deal.id, { stageId: qualifiedStageId } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    // Stage didn't change.
    const after = await dealService.get(test.ctx, deal.id);
    expect(after.stageId).toBe(leadStageId);
  });

  it('moveStage — rejects a stage from a different pipeline', async () => {
    // Make a second pipeline so we have a stage in a different one.
    const other = await pipelineService.create(test.ctx, {
      name: 'Other Pipeline',
      slug: `other-${Date.now()}`,
      isDefault: false,
      sortOrder: 1,
    });
    const otherStage = await pipelineService.createStage(test.ctx, other.id, {
      name: 'Some Stage',
      sortOrder: 0,
      probability: 50,
      stageType: 'open',
    });

    const deal = await dealService.create(test.ctx, {
      pipelineId,
      stageId: leadStageId,
      customerId,
      title: 'Cross-pipeline test',
      value: 1_000,
    });

    await expect(
      dealService.moveStage(test.ctx, deal.id, { toStageId: otherStage.id }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
