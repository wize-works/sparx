// publishService — the draft → publish → rollback lifecycle.
//
// publishNow snapshots the draft into an immutable SiteVersion and write-throughs
// the compiled light tokens to StorefrontTheme (all in one transaction; the
// event fires only after commit). rollback restores a prior version's snapshot
// into the draft and republishes it as a new version. getPublishedSnapshot is
// the read the storefront's public endpoint consumes.

import { PublishInput, RollbackInput } from '@sparx/sitebuilder-schemas';
import type { SiteVersion } from '@sparx/db';
import { withTenant, type TxClient } from '@sparx/db';
import {
  applyBrandIdentityTokens,
  compileTokens,
  compileThemeForTenant,
  type PresentationOverlayV2,
} from '@sparx/storefront-themes';

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

// Brand identity (docs/30 §6) is the tenant-level source of truth and is read
// LIVE here, overlaid on top of the (published or draft) compiled tokens so a
// brand edit reflects on the storefront without a full re-publish, and so brand
// always WINS over theme/merchant identity values. Read-only — never written back.
//
// This is also where the Token Model v2 set is compiled (docs/33): the same live
// brand columns + the presentation overlay (from the version snapshot or the
// draft config) are layered over the theme preset via compileThemeForTenant. By
// compiling at READ rather than baking at publish, a brand edit reflects
// immediately on the v2 path too, and the stored SiteVersion shape is untouched.
async function overlayBrand(
  tx: TxClient,
  tenantId: string,
  snapshot: PublishedSnapshot,
  presentation: PresentationOverlayV2 | null
): Promise<PublishedSnapshot> {
  const brand = await tx.tenantBrand.findUnique({
    where: { tenantId },
    select: {
      colorPrimary: true,
      colorPrimaryForeground: true,
      colorAccent: true,
      fontHeading: true,
      fontBody: true,
      // shape/rhythm/effect — feeds compiledV2 (the v1 identity overlay below
      // ignores it; applyBrandIdentityTokens only touches colour/type).
      tokens: true,
    },
  });
  const compiledTokens = brand
    ? applyBrandIdentityTokens(snapshot.compiledTokens, brand)
    : snapshot.compiledTokens;
  const compiledV2 = compileThemeForTenant({
    themeKey: snapshot.themeKey,
    brand,
    presentation,
  });
  return { ...snapshot, compiledTokens, compiledV2 };
}

// The presentation overlay persisted in a settings JSON blob (draft config or a
// published version's snapshot). Typed loosely at the boundary, then trusted by
// the v2 compiler (which reads only nullable string slots).
function readPresentation(settings: unknown): PresentationOverlayV2 | null {
  if (!settings || typeof settings !== 'object') return null;
  const p = (settings as { presentation?: unknown }).presentation;
  return p && typeof p === 'object' ? p : null;
}

/** The published snapshot for the storefront. Null when nothing is published. */
export async function getPublishedSnapshot(ctx: ServiceContext): Promise<PublishedSnapshot | null> {
  return withTenant(ctx, async (tx) => {
    const config = await tx.siteConfig.findUnique({ where: { tenantId: ctx.tenantId } });
    if (!config?.publishedVersionId) return null;
    const version = await tx.siteVersion.findUnique({ where: { id: config.publishedVersionId } });
    if (!version) return null;
    const presentation = readPresentation(version.settingsSnapshot);
    return overlayBrand(tx, ctx.tenantId, toPublishedSnapshot(version), presentation);
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
    const presentation = readPresentation(config.draftSettings);
    const snapshot: PublishedSnapshot = {
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
    return overlayBrand(tx, ctx.tenantId, snapshot, presentation);
  });
}
