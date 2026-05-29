// Scheduled-publish tick smoke test.
//
//   1. Create a draft entry.
//   2. POST /publish with scheduled_at in the future → status flips to
//      'scheduled', scheduledAt set.
//   3. Backdate scheduledAt directly in the DB (so it's "due").
//   4. Run the tick — assert it flips to 'published' + clears scheduledAt
//      + records a manual revision summarising the scheduled publish.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '@sparx/db';
import { runScheduledPublishTick } from '../../src/lib/scheduled-publish.js';
import { createApp } from '../../src/app.js';
import {
  type TestTenant,
  authHeader,
  createTestTenant,
  dropTestTenant,
  signToken,
} from '../helpers.js';

describe('scheduled-publish tick', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  let token: string;
  let entryId: string;

  beforeAll(async () => {
    app = await createApp();
    tenant = await createTestTenant('editor');
    token = signToken(app, tenant, 'editor');

    const create = await app.inject({
      method: 'POST',
      url: '/v1/content/entries',
      headers: authHeader(token),
      payload: {
        type_key: 'page',
        slug: 'scheduled-flip',
        body: { title: 'About to drop', body: { type: 'doc', content: [] } },
      },
    });
    expect(create.statusCode).toBe(201);
    entryId = create.json().data.id;

    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const publish = await app.inject({
      method: 'POST',
      url: `/v1/content/entries/${entryId}/publish`,
      headers: authHeader(token),
      payload: { scheduled_at: future },
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().data.status).toBe('scheduled');
  });

  afterAll(async () => {
    await dropTestTenant(tenant.tenantId);
    await app.close();
  });

  it('flips status=scheduled → status=published when scheduledAt is due', async () => {
    // Backdate scheduledAt so the tick sees it as due.
    await withTenant({ tenantId: tenant.tenantId }, (tx) =>
      tx.contentEntry.update({
        where: { id: entryId },
        data: { scheduledAt: new Date(Date.now() - 60 * 1000) },
      })
    );

    const result = await runScheduledPublishTick(app.log);
    expect(result.acquired).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.errors).toBe(0);

    const after = await withTenant({ tenantId: tenant.tenantId }, (tx) =>
      tx.contentEntry.findUnique({ where: { id: entryId } })
    );
    expect(after?.status).toBe('published');
    expect(after?.scheduledAt).toBeNull();
    expect(after?.publishedAt).toBeInstanceOf(Date);

    // A manual revision summarising the scheduled publish should exist.
    const revisions = await withTenant({ tenantId: tenant.tenantId }, (tx) =>
      tx.contentRevision.findMany({
        where: { entryId },
        orderBy: { revisionNumber: 'desc' },
      })
    );
    const manualPublish = revisions.find(
      (r) => r.kind === 'manual' && r.summary?.toLowerCase().includes('scheduled')
    );
    expect(manualPublish).toBeTruthy();
  });

  it('subsequent tick is a no-op (status is already published)', async () => {
    const result = await runScheduledPublishTick(app.log);
    expect(result.acquired).toBe(true);
    expect(result.processed).toBe(0);
  });
});
