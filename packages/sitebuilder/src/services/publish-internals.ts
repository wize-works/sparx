// Transaction-scoped publish helpers, shared by publishNow, rollback, and the
// scheduled-publish tick. Keeping these tx-based (they take a TxClient rather
// than opening their own withTenant) lets a caller compose them with other
// writes — e.g. the scheduled tick flips a schedule row to 'published' in the
// SAME transaction as the publish.

import type { Prisma, SiteConfig, SiteVersion, TxClient } from '@sparx/db';
import {
  compileTokens,
  toStorefrontThemeColumns,
  type CompiledThemeV2,
} from '@sparx/storefront-themes';

import { writeAuditLog } from '../audit';
import { SitebuilderNotFoundError } from '../errors';
import { getOrCreatePageLayout } from './page-layout-service';

// Legacy pageKey ↔ (targetId, key) mapping. This is the ONLY place it survives:
// the snapshot path still writes `pageKey` onto each SectionSnapshot for the
// home/CMS-page render path, and rollback of a pre-Phase-3 SiteVersion (sections
// carrying only `pageKey`) maps it back to a (targetId, key) layout. "home" ↔
// site:home/default; any other slug ↔ cms:content-page/<slug>.
function pageKeyForLayout(t: { targetId: string; key: string }): string {
  return t.targetId === 'site:home' ? 'home' : t.key;
}
function targetKeyForPageKey(pageKey: string): { targetId: string; key: string; name: string } {
  return pageKey === 'home'
    ? { targetId: 'site:home', key: 'default', name: 'Home' }
    : { targetId: 'cms:content-page', key: pageKey, name: pageKey };
}

export interface SectionSnapshot {
  id: string;
  // The owning layout's target id + key (docs/36 §4). Optional because
  // pre-Phase-3 stored versions carry only `pageKey`; the read path maps pageKey
  // → targetId/key for those. New publishes always set them.
  targetId?: string;
  templateKey?: string;
  templateId?: string;
  // Back-compat: "home" or a slug, derived from the template. Pre-Phase-3
  // storefront readers still key composition off this.
  pageKey: string;
  sectionType: string;
  position: number;
  visible: boolean;
  config: Record<string, unknown>;
}

export interface LayoutSnapshot {
  slot: string;
  navigationMenuId: string | null;
  config: Record<string, unknown>;
  visible: boolean;
}

export interface PublishedSnapshot {
  versionNumber: number;
  themeKey: string;
  appearancePolicy: string;
  // v1 compiled tokens (kept for the legacy bridge + write-through to
  // StorefrontTheme). Never dropped — existing tenants render off it as fallback.
  compiledTokens: { light: Record<string, string>; dark: Record<string, string> };
  // Token Model v2 compiled set — the storefront's preferred read path
  // (docs/33). Computed LIVE at read (publish-service.overlayBrand) from the
  // theme key + tenant brand + presentation overlay, so brand edits reflect
  // without a re-publish; absent only when a brand row can't be read.
  compiledV2?: CompiledThemeV2;
  sections: SectionSnapshot[];
  layout: LayoutSnapshot[];
}

function toSectionSnapshot(s: {
  id: string;
  pageLayoutId: string;
  sectionType: string;
  position: number;
  visible: boolean;
  config: Prisma.JsonValue;
  pageLayout: { targetId: string; key: string };
}): SectionSnapshot {
  // `templateKey`/`templateId`/`pageKey` keep their P-A names (renaming those is
  // a separate later tidy); `targetId` carries the data-driven target (docs/36 §4).
  return {
    id: s.id,
    targetId: s.pageLayout.targetId,
    templateKey: s.pageLayout.key,
    templateId: s.pageLayoutId,
    pageKey: pageKeyForLayout(s.pageLayout),
    sectionType: s.sectionType,
    position: s.position,
    visible: s.visible,
    config: (s.config ?? {}) as Record<string, unknown>,
  };
}

// Exported so getDraftSnapshot (publish-service) renders the live preview off the
// exact same draft assembly the publish path snapshots — one reader, no drift.
export async function readDraft(
  tx: TxClient
): Promise<{ sections: SectionSnapshot[]; layout: LayoutSnapshot[] }> {
  const [sections, layout] = await Promise.all([
    tx.siteSection.findMany({
      include: { pageLayout: { select: { targetId: true, key: true } } },
      orderBy: [{ pageLayoutId: 'asc' }, { position: 'asc' }],
    }),
    tx.siteLayoutBlock.findMany({ orderBy: { slot: 'asc' } }),
  ]);
  return {
    sections: sections.map(toSectionSnapshot),
    layout: layout.map((b) => ({
      slot: b.slot,
      navigationMenuId: b.navigationMenuId,
      config: (b.config ?? {}) as Record<string, unknown>,
      visible: b.visible,
    })),
  };
}

async function nextVersionNumber(tx: TxClient, tenantId: string): Promise<number> {
  const last = await tx.siteVersion.findFirst({
    where: { tenantId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  });
  return (last?.versionNumber ?? 0) + 1;
}

// Write-through: project the compiled LIGHT tokens onto the commerce-owned
// StorefrontTheme row so the storefront's existing token read path keeps
// working. Never adds columns — only sets the mapped subset.
async function writeThrough(
  tx: TxClient,
  tenantId: string,
  lightTokens: Record<string, string>
): Promise<void> {
  const columns = toStorefrontThemeColumns(
    lightTokens as Parameters<typeof toStorefrontThemeColumns>[0]
  );
  await tx.storefrontTheme.upsert({
    where: { tenantId },
    create: { tenantId, ...columns },
    update: columns,
  });
}

/**
 * Snapshot the current draft into a new immutable SiteVersion, point the config
 * at it, and write-through the compiled light tokens. Returns the new version.
 * Must run inside a withTenant transaction.
 */
export async function publishWithinTx(
  tx: TxClient,
  args: { tenantId: string; userId: string | null; note?: string }
): Promise<SiteVersion> {
  const { tenantId, userId, note } = args;
  const config = await tx.siteConfig.findUnique({ where: { tenantId } });
  if (!config) throw new SitebuilderNotFoundError('SiteConfig', tenantId);

  const settings = (config.draftSettings ?? {}) as {
    tokens?: { light?: Record<string, string>; dark?: Record<string, string> };
  };
  const compiled = compileTokens(config.themeKey, settings.tokens ?? {});
  const draft = await readDraft(tx);
  const versionNumber = await nextVersionNumber(tx, tenantId);

  const version = await tx.siteVersion.create({
    data: {
      tenantId,
      versionNumber,
      themeKey: config.themeKey,
      appearancePolicy: config.appearancePolicy,
      settingsSnapshot: config.draftSettings as Prisma.InputJsonValue,
      sectionsSnapshot: draft.sections as unknown as Prisma.InputJsonValue,
      layoutSnapshot: draft.layout as unknown as Prisma.InputJsonValue,
      compiledTokens: compiled as unknown as Prisma.InputJsonValue,
      publishedById: userId,
      note: note ?? null,
    },
  });

  await tx.siteConfig.update({
    where: { tenantId },
    data: { publishedVersionId: version.id },
  });

  await writeThrough(tx, tenantId, compiled.light);

  await writeAuditLog({
    tx,
    tenantId,
    actorId: userId,
    actorType: userId ? 'user' : 'system',
    action: 'sitebuilder.published',
    entityType: 'SiteVersion',
    entityId: version.id,
    diff: { after: { versionNumber, themeKey: config.themeKey } },
  });

  return version;
}

// Resolve a snapshot section's owning (targetId, key, name): explicit on
// post-P-B snapshots, derived from the legacy pageKey otherwise.
function resolveTargetKey(s: SectionSnapshot): { targetId: string; key: string; name: string } {
  if (s.targetId && s.templateKey) {
    return {
      targetId: s.targetId,
      key: s.templateKey,
      name: s.targetId === 'site:home' ? 'Home' : s.templateKey,
    };
  }
  return targetKeyForPageKey(s.pageKey);
}

/**
 * Restore the draft (config + sections + layout) from a published version's
 * snapshot — the first half of a rollback. The caller then re-publishes the
 * restored draft as a new version.
 */
export async function materializeWithinTx(
  tx: TxClient,
  tenantId: string,
  version: SiteVersion
): Promise<SiteConfig> {
  const sections = (version.sectionsSnapshot ?? []) as unknown as SectionSnapshot[];
  const layout = (version.layoutSnapshot ?? []) as unknown as LayoutSnapshot[];

  const config = await tx.siteConfig.update({
    where: { tenantId },
    data: {
      themeKey: version.themeKey,
      appearancePolicy: version.appearancePolicy,
      draftSettings: version.settingsSnapshot as Prisma.InputJsonValue,
    },
  });

  // Rebuild the draft section rows to match the snapshot. Sections now hang off
  // a template, so resolve each section's (scope, key) — explicit on Phase-3
  // snapshots, derived from pageKey on legacy ones — to a get-or-created template
  // first (ids survive a rollback and stay referenced by future publishes).
  await tx.siteSection.deleteMany({});
  if (sections.length > 0) {
    const layoutIdByKey = new Map<string, string>();
    const rows: Prisma.SiteSectionCreateManyInput[] = [];
    for (const s of sections) {
      const { targetId, key, name } = resolveTargetKey(s);
      const mapKey = `${targetId} ${key}`;
      let pageLayoutId = layoutIdByKey.get(mapKey);
      if (!pageLayoutId) {
        const layout = await getOrCreatePageLayout(tx, tenantId, targetId, key, name);
        pageLayoutId = layout.id;
        layoutIdByKey.set(mapKey, pageLayoutId);
      }
      rows.push({
        tenantId,
        pageLayoutId,
        sectionType: s.sectionType,
        position: s.position,
        visible: s.visible,
        config: s.config as Prisma.InputJsonValue,
      });
    }
    await tx.siteSection.createMany({ data: rows });
  }

  // Rebuild the layout blocks to match the snapshot.
  await tx.siteLayoutBlock.deleteMany({});
  if (layout.length > 0) {
    await tx.siteLayoutBlock.createMany({
      data: layout.map((b) => ({
        tenantId,
        slot: b.slot,
        navigationMenuId: b.navigationMenuId,
        config: b.config as Prisma.InputJsonValue,
        visible: b.visible,
      })),
    });
  }

  return config;
}

/** Shapes a stored SiteVersion into the snapshot the storefront consumes. */
export function toPublishedSnapshot(version: SiteVersion): PublishedSnapshot {
  return {
    versionNumber: version.versionNumber,
    themeKey: version.themeKey,
    appearancePolicy: version.appearancePolicy,
    compiledTokens: version.compiledTokens as unknown as PublishedSnapshot['compiledTokens'],
    sections: (version.sectionsSnapshot ?? []) as unknown as SectionSnapshot[],
    layout: (version.layoutSnapshot ?? []) as unknown as LayoutSnapshot[],
  };
}
