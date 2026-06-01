// savedThemeService — the tenant's named theme variants (docs/36 Brand+Theme
// tier) and the scheduled-publish theme swap. Covers CRUD, ownership (RLS →
// NotFound), `apply` loading a saved theme into the working draft, and a
// scheduled publish that applies its theme before snapshotting.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { savedThemeService, scheduleService, themeService } from '../../src/services/index.js';
import { SitebuilderNotFoundError } from '../../src/errors.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

const MISSING_ID = '00000000-0000-0000-0000-000000000000';

describe('sitebuilder saved themes', () => {
  let test: TestContext;
  let summerId: string;

  beforeAll(async () => {
    test = await makeTestContext('owner');
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  it('create — saves a named presentation variant; list is sorted by name', async () => {
    const summer = await savedThemeService.create(test.ctx, {
      name: 'Summer',
      basePresetKey: 'apex',
      presentation: { containerWidth: '1200px' },
    });
    summerId = summer.id;
    expect(summer.name).toBe('Summer');
    expect(summer.basePresetKey).toBe('apex');
    expect(summer.presentation.containerWidth).toBe('1200px');

    await savedThemeService.create(test.ctx, {
      name: 'Holiday',
      basePresetKey: 'industrial',
      presentation: { containerWidth: '1320px' },
    });

    const list = await savedThemeService.list(test.ctx);
    expect(list.map((t) => t.name)).toEqual(['Holiday', 'Summer']);
  });

  it('update — renames and replaces the presentation', async () => {
    const updated = await savedThemeService.update(test.ctx, summerId, {
      name: 'Summer Sale',
      presentation: { containerWidth: '1280px' },
    });
    expect(updated.name).toBe('Summer Sale');
    expect(updated.presentation.containerWidth).toBe('1280px');
  });

  it('apply — loads the saved theme into the working draft (theme + presentation), no publish', async () => {
    const result = await savedThemeService.apply(test.ctx, summerId);
    expect(result).toEqual({ ok: true, themeKey: 'apex' });

    const config = await themeService.getConfig(test.ctx);
    expect(config.themeKey).toBe('apex');
    const draft = config.draftSettings as { presentation?: { containerWidth?: string } };
    expect(draft.presentation?.containerWidth).toBe('1280px');
    // Not published — apply only stages the draft.
    expect(config.publishedVersionId).toBeNull();
  });

  it('scheduled publish — applies the schedule’s theme before snapshotting', async () => {
    const holiday = (await savedThemeService.list(test.ctx)).find((t) => t.name === 'Holiday');
    expect(holiday).toBeTruthy();

    const scheduled = await scheduleService.schedule(test.ctx, {
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      note: 'go live for the holidays',
      themeId: holiday!.id,
    });
    expect(scheduled.status).toBe('pending');

    const result = await scheduleService.processDueSchedule(test.ctx, scheduled.id);
    expect(result.status).toBe('published');
    // The schedule pointed at the Holiday theme (industrial) — the published
    // version carries it, even though the draft was on apex from the apply test.
    expect(result.version?.themeKey).toBe('industrial');

    const config = await themeService.getConfig(test.ctx);
    expect(config.themeKey).toBe('industrial');
  });

  it('remove — deletes the variant', async () => {
    const removed = await savedThemeService.remove(test.ctx, summerId);
    expect(removed.id).toBe(summerId);
    const list = await savedThemeService.list(test.ctx);
    expect(list.map((t) => t.name)).toEqual(['Holiday']);
  });

  it('ownership — update/apply/remove of an unknown id rejects (RLS → NotFound)', async () => {
    await expect(
      savedThemeService.update(test.ctx, MISSING_ID, { name: 'x' })
    ).rejects.toBeInstanceOf(SitebuilderNotFoundError);
    await expect(savedThemeService.apply(test.ctx, MISSING_ID)).rejects.toBeInstanceOf(
      SitebuilderNotFoundError
    );
    await expect(savedThemeService.remove(test.ctx, MISSING_ID)).rejects.toBeInstanceOf(
      SitebuilderNotFoundError
    );
  });
});
