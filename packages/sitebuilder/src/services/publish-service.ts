// publishService — the draft → publish → rollback lifecycle.
//
// publishNow snapshots the draft into an immutable SiteVersion and write-throughs
// the compiled light tokens to StorefrontTheme (all in one transaction; the
// event fires only after commit). rollback restores a prior version's snapshot
// into the draft and republishes it as a new version. getPublishedSnapshot is
// the read the storefront's public endpoint consumes.

import { PublishInput, RollbackInput } from '@sparx/sitebuilder-schemas';
import type { SiteVersion } from '@sparx/db';
import { withTenant } from '@sparx/db';
import { compileTokens } from '@sparx/storefront-themes';

import { publishSitebuilderEvent } from '../events';
import type { ServiceContext } from '../errors';
import { SitebuilderNotFoundError } from '../errors';
import { getOrCreateConfig } from './_config';
import {
  materializeWithinTx,
  publishWithinTx,
  toPublishedSnapshot,
  type PublishedSnapshot,
} from './publish-internals';

export async function publishNow(
  ctx: ServiceContext,
  rawInput: unknown = {}
): Promise<SiteVersion> {
  const input = PublishInput.parse(rawInput);
  const version = await withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    return publishWithinTx(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? null,
      note: input.note,
    });
  });

  await publishSitebuilderEvent({
    tenantId: ctx.tenantId,
    topic: 'sitebuilder.published',
    payload: {
      versionId: version.id,
      versionNumber: version.versionNumber,
      themeKey: version.themeKey,
    },
    dedupeKey: `sitebuilder.published:${version.id}`,
  });

  return version;
}

export function listVersions(
  ctx: ServiceContext,
  opts: { take?: number; skip?: number } = {}
): Promise<{ items: SiteVersion[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const [items, total] = await Promise.all([
      tx.siteVersion.findMany({
        orderBy: { versionNumber: 'desc' },
        take: Math.min(opts.take ?? 50, 200),
        skip: opts.skip ?? 0,
      }),
      tx.siteVersion.count(),
    ]);
    return { items, total };
  });
}

export async function getVersion(ctx: ServiceContext, versionId: string): Promise<SiteVersion> {
  const version = await withTenant(ctx, (tx) =>
    tx.siteVersion.findUnique({ where: { id: versionId } })
  );
  if (!version) throw new SitebuilderNotFoundError('SiteVersion', versionId);
  return version;
}

export async function rollback(ctx: ServiceContext, rawInput: unknown): Promise<SiteVersion> {
  const input = RollbackInput.parse(rawInput);
  const version = await withTenant(ctx, async (tx) => {
    const target = await tx.siteVersion.findUnique({ where: { id: input.versionId } });
    if (!target) throw new SitebuilderNotFoundError('SiteVersion', input.versionId);
    await materializeWithinTx(tx, ctx.tenantId, target);
    return publishWithinTx(tx, {
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? null,
      note: `Rollback to v${target.versionNumber}`,
    });
  });

  await publishSitebuilderEvent({
    tenantId: ctx.tenantId,
    topic: 'sitebuilder.rolled_back',
    payload: { versionId: version.id, versionNumber: version.versionNumber },
    dedupeKey: `sitebuilder.rolled_back:${version.id}`,
  });

  return version;
}

/** The published snapshot for the storefront. Null when nothing is published. */
export async function getPublishedSnapshot(ctx: ServiceContext): Promise<PublishedSnapshot | null> {
  return withTenant(ctx, async (tx) => {
    const config = await tx.siteConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!config?.publishedVersionId) return null;
    const version = await tx.siteVersion.findUnique({ where: { id: config.publishedVersionId } });
    return version ? toPublishedSnapshot(version) : null;
  });
}

/**
 * The current DRAFT assembled into the same snapshot shape — what the
 * customizer's live preview renders. Compiled on the fly (not yet a version).
 */
export async function getDraftSnapshot(ctx: ServiceContext): Promise<PublishedSnapshot> {
  return withTenant(ctx, async (tx) => {
    const config = await getOrCreateConfig(tx, ctx.tenantId);
    const [sections, layout] = await Promise.all([
      tx.siteSection.findMany({ orderBy: [{ pageKey: 'asc' }, { position: 'asc' }] }),
      tx.siteLayoutBlock.findMany({ orderBy: { slot: 'asc' } }),
    ]);
    const settings = (config.draftSettings ?? {}) as {
      tokens?: { light?: Record<string, string>; dark?: Record<string, string> };
    };
    const compiled = compileTokens(config.themeKey, settings.tokens ?? {});
    return {
      versionNumber: 0,
      themeKey: config.themeKey,
      appearancePolicy: config.appearancePolicy,
      compiledTokens: compiled,
      sections: sections.map((s) => ({
        id: s.id,
        pageKey: s.pageKey,
        sectionType: s.sectionType,
        position: s.position,
        visible: s.visible,
        config: (s.config ?? {}) as Record<string, unknown>,
      })),
      layout: layout.map((b) => ({
        slot: b.slot,
        navigationMenuId: b.navigationMenuId,
        config: (b.config ?? {}) as Record<string, unknown>,
        visible: b.visible,
      })),
    };
  });
}
