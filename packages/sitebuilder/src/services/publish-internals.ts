// Transaction-scoped publish helpers, shared by publishNow, rollback, and the
// scheduled-publish tick. Keeping these tx-based (they take a TxClient rather
// than opening their own withTenant) lets a caller compose them with other
// writes — e.g. the scheduled tick flips a schedule row to 'published' in the
// SAME transaction as the publish.

import type { Prisma, SiteConfig, SiteVersion, TxClient } from '@sparx/db';
import { compileTokens, toStorefrontThemeColumns } from '@sparx/storefront-themes';

import { writeAuditLog } from '../audit';
import { SitebuilderNotFoundError } from '../errors';

export interface SectionSnapshot {
  id: string;
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
  compiledTokens: { light: Record<string, string>; dark: Record<string, string> };
  sections: SectionSnapshot[];
  layout: LayoutSnapshot[];
}

async function readDraft(
  tx: TxClient
): Promise<{ sections: SectionSnapshot[]; layout: LayoutSnapshot[] }> {
  const [sections, layout] = await Promise.all([
    tx.siteSection.findMany({ orderBy: [{ pageKey: 'asc' }, { position: 'asc' }] }),
    tx.siteLayoutBlock.findMany({ orderBy: { slot: 'asc' } }),
  ]);
  return {
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

  // Rebuild the draft section rows to match the snapshot.
  await tx.siteSection.deleteMany({});
  if (sections.length > 0) {
    await tx.siteSection.createMany({
      data: sections.map((s) => ({
        tenantId,
        pageKey: s.pageKey,
        sectionType: s.sectionType,
        position: s.position,
        visible: s.visible,
        config: s.config as Prisma.InputJsonValue,
      })),
    });
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
