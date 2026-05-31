// publishService — the draft → publish → schedule → rollback lifecycle, plus
// the architectural commitments that aren't visible from the signatures:
//   • Publishing snapshots the draft into an immutable, monotonically-numbered
//     SiteVersion and write-throughs the compiled light tokens to the
//     commerce-owned StorefrontTheme row (same transaction).
//   • A sitebuilder.published event fires AFTER commit (RecordingPublisher).
//   • Rollback restores a prior version's snapshot into the draft and
//     republishes it as a NEW version (history is append-only).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  themeService,
  sectionService,
  publishService,
  scheduleService,
} from '../../src/services/index.js';
import {
  disposeTestContext,
  makeTestContext,
  readStorefrontTheme,
  type TestContext,
} from '../helpers.js';

describe('sitebuilder publish lifecycle', () => {
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

  it('publishNow — snapshots draft, write-throughs light tokens, emits event', async () => {
    await themeService.selectTheme(test.ctx, { themeKey: 'industrial' });
    await sectionService.create(test.ctx, {
      scope: 'home',
      sectionType: 'hero',
      config: { heading: 'Built tough' },
    });
    test.publisher.clear();

    const version = await publishService.publishNow(test.ctx, { note: 'first launch' });
    expect(version.versionNumber).toBe(1);
    expect(version.themeKey).toBe('industrial');

    // Event fired after commit.
    const published = test.publisher.events.filter((e) => e.topic === 'sitebuilder.published');
    expect(published).toHaveLength(1);

    // getPublishedSnapshot reflects the live version. Identity tokens
    // (colorPrimary) still appear in the compiled snapshot — they come from the
    // theme preset here (this tenant has no brand overlay).
    const snap = await publishService.getPublishedSnapshot(test.ctx);
    expect(snap?.themeKey).toBe('industrial');
    expect(snap?.sections).toHaveLength(1);
    expect(snap?.compiledTokens.light.colorPrimary).toBe('#cc1010');
    expect(snap?.compiledTokens.dark.colorPrimary).toBe('#ef4444');

    // Write-through: StorefrontTheme mirrors the compiled light *presentation*
    // tokens only — brand identity (colour/type/logo) is owned by TenantBrand
    // now (docs/30 §6), not this row.
    const theme = await readStorefrontTheme(test.tenant.tenantId);
    expect(theme?.colorBackground).toBe(snap?.compiledTokens.light.colorBackground);
    expect(theme?.radiusBase).toBe(snap?.compiledTokens.light.radiusBase);
  });

  it('rollback — restores a prior version and republishes as a new version', async () => {
    // Publish v2 with a different theme.
    await themeService.selectTheme(test.ctx, { themeKey: 'apex' });
    const v2 = await publishService.publishNow(test.ctx);
    expect(v2.versionNumber).toBe(2);
    // Write-through tracks the active version's compiled *presentation* tokens
    // (identity is brand-owned now, no longer mirrored here).
    let theme = await readStorefrontTheme(test.tenant.tenantId);
    let snap = await publishService.getPublishedSnapshot(test.ctx);
    expect(theme?.colorBackground).toBe(snap?.compiledTokens.light.colorBackground); // apex

    // Roll back to v1 (industrial) → creates v3, restores tokens + draft theme.
    test.publisher.clear();
    const v3 = await publishService.rollback(test.ctx, { versionId: v1Id(await listIds(test)) });
    expect(v3.versionNumber).toBe(3);
    expect(v3.themeKey).toBe('industrial');

    theme = await readStorefrontTheme(test.tenant.tenantId);
    snap = await publishService.getPublishedSnapshot(test.ctx);
    expect(theme?.colorBackground).toBe(snap?.compiledTokens.light.colorBackground); // industrial

    const config = await themeService.getConfig(test.ctx);
    expect(config.themeKey).toBe('industrial');

    expect(test.publisher.events.some((e) => e.topic === 'sitebuilder.rolled_back')).toBe(true);
  });

  it('listVersions — newest first, append-only history', async () => {
    const { items, total } = await publishService.listVersions(test.ctx);
    expect(total).toBe(3);
    expect(items.map((v) => v.versionNumber)).toEqual([3, 2, 1]);
  });

  it('schedule — creates a pending schedule and processDueSchedule publishes it', async () => {
    const scheduled = await scheduleService.schedule(test.ctx, {
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      note: 'go live',
    });
    expect(scheduled.status).toBe('pending');

    const result = await scheduleService.processDueSchedule(test.ctx, scheduled.id);
    expect(result.status).toBe('published');
    expect(result.version?.versionNumber).toBe(4);

    const schedules = await scheduleService.listSchedules(test.ctx);
    expect(schedules.find((s) => s.id === scheduled.id)?.status).toBe('published');
  });
});

// Helpers to find v1's id without threading it through the suite state.
async function listIds(test: TestContext): Promise<{ id: string; versionNumber: number }[]> {
  const { items } = await publishService.listVersions(test.ctx);
  return items.map((v) => ({ id: v.id, versionNumber: v.versionNumber }));
}
function v1Id(versions: { id: string; versionNumber: number }[]): string {
  const v1 = versions.find((v) => v.versionNumber === 1);
  if (!v1) throw new Error('v1 not found');
  return v1.id;
}
