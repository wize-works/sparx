// Blueprint updater (docs/55 §6, §8) — the non-destructive apply of a newer
// blueprint version onto an installed tenant. It loads the per-artifact BASELINE
// (the ancestor), extracts the tenant's LIVE content in the same canonical shape,
// runs the pure three-way merge (@wizeworks/blueprints), and writes the result back
// through the existing service layer — so a tenant edit is never overwritten
// automatically (docs/55 U1).
//
// `planUpdate` computes the changeset without writing (preview). `applyUpdate`
// executes it, re-publishes a live install, then advances the baselines + the
// install version so the NEXT update measures drift from here.
//
// Structured like the installer (services do their own withTenant) so it lifts
// into the async worker later. Artifact KINDS are handled by a registry; this
// slice ships `theme` + `brand` (the layered theme is the named must-have, docs/55
// §7.1). Trees and commerce/content register their handlers in later slices.

import type { FastifyBaseLogger } from 'fastify';

import { withTenant, type Prisma } from '@wizeworks/db';
import { savedThemeService, publishService } from '@wizeworks/sitebuilder';
import { emailService, pageService, siteService } from '@wizeworks/builder';
import {
  categoryService,
  collectionService,
  productService,
  variantService,
} from '@wizeworks/commerce';
import type { SilicaNode } from '@wizeworks/builder-schemas';
import {
  parseTypeSchema,
  publishTimestamp,
  resolveType,
  validateAndNormalizeBody,
  recordRevision,
  syncReferences,
} from '@wizeworks/cms';
import {
  mergeByKey,
  mergeTree,
  mergeValue,
  resolverFrom,
  type Blueprint,
  type ConflictSide,
  type FieldChange,
  type MergeResult,
} from '@wizeworks/blueprints';

import {
  captureBaselines,
  loadBaselines,
  resolveBlueprintArtifacts,
  type ArtifactKind,
  type ResolvedArtifact,
} from './blueprint-baseline.js';
import { mimeFromUrl, type InstallResult } from './blueprint-installer.js';

export interface UpdateContext {
  tenantId: string;
  userId: string | null;
  propertyId: string;
  logger: FastifyBaseLogger;
}

interface InstallRowLite {
  id: string;
  blueprintKey: string;
  blueprintVersion: string;
  status: string;
  propertyId: string;
  result: unknown;
  /** Did the install bring the design's EXAMPLES (issue 098)? An update must ask
   *  the same question: a newer version adding three products is still the
   *  furniture she declined, and "the design changed" is not consent. */
  sampleData: boolean;
}

/** The per-artifact outcome surfaced in a preview + recorded on apply. */
export interface ArtifactDiff {
  kind: ArtifactKind;
  naturalKey: string;
  refId: string | null;
  /** unchanged — nothing to do; updated — only auto fast-forwards; conflict — at
   *  least one field both sides changed; new — upstream added it; removed —
   *  upstream dropped it (kept as an orphan); detached — tenant opted out;
   *  tenant_deleted — the tenant deleted the live row (not recreated). */
  status: 'unchanged' | 'updated' | 'conflict' | 'new' | 'removed' | 'detached' | 'tenant_deleted';
  /** Auto fast-forwards + conflicts, each globally addressable as
   *  `${kind}:${naturalKey}#${path}` for the apply resolution map. */
  changes: (FieldChange & { id: string })[];
}

export interface UpdatePlan {
  installId: string;
  blueprintKey: string;
  fromVersion: string;
  toVersion: string;
  updatable: boolean;
  artifacts: ArtifactDiff[];
  summary: { updated: number; conflicts: number; auto: number; new: number; removed: number };
}

export interface ApplyResult {
  installId: string;
  fromVersion: string;
  toVersion: string;
  applied: number;
  conflicts: number;
  artifacts: ArtifactDiff[];
}

type Json = Record<string, unknown>;

interface Env {
  tenantId: string;
  ctx: { tenantId: string; userId?: string };
  propCtx: { tenantId: string; userId?: string; propertyId: string };
  isPrimary: boolean;
  /** True during apply (assets are find-or-CREATEd); false during preview (find-only). */
  write: boolean;
}

/** A per-kind merge handler: read the tenant's live content in canonical shape,
 *  and (on apply) write the merged content back through the service layer. */
interface KindHandler {
  kind: ArtifactKind;
  /** Read the live row → canonical content matching the baseline shape, or null
   *  if the tenant deleted it. */
  extractCurrent(env: Env, artifact: ResolvedArtifact): Promise<Json | null>;
  /** Persist the merged content. */
  writeMerged(env: Env, artifact: ResolvedArtifact, merged: Json): Promise<void>;
  /** Optional custom merge (tree kinds node-merge their `tree` field). Defaults to
   *  the generic field merge. */
  merge?(base: Json | undefined, current: Json, incoming: Json, resolve: Resolver): MergeResult;
  /** Create an artifact the new version ADDED that this install does not yet have
   *  (docs/55: a design that introduces a page in a later version should deliver it on
   *  update). Returns the created row id, or null if creation is not supported for the
   *  kind. Only ever called on APPLY (never preview). */
  create?(env: Env, artifact: ResolvedArtifact): Promise<string | null>;
}

type Resolver = (path: string) => ConflictSide;

/** Drop only `undefined` (an unset optional == absent); an explicit `null` is a
 *  real value (a slugless home page's `slug`, a theme's absent `brand`) and is
 *  preserved so it matches the baseline. */
function compact(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/** Tree-bearing artifacts: node-merge the `tree` field (docs/55 §7.2) and
 *  field-merge every other (scalar) field, then recombine. */
function mergeTreeArtifact(
  base: Json | undefined,
  current: Json,
  incoming: Json,
  resolve: Resolver
): MergeResult {
  const split = (c: Json | undefined): { rest: Json | undefined; tree: SilicaNode | undefined } => {
    if (!c) return { rest: undefined, tree: undefined };
    const { tree, ...rest } = c;
    return { rest, tree: tree as SilicaNode | undefined };
  };
  const b = split(base);
  const cu = split(current);
  const inc = split(incoming);
  const restRes = mergeValue(b.rest, cu.rest, inc.rest, { resolve });
  const treeRes = mergeTree(b.tree, cu.tree, inc.tree, { resolve }, 'tree');
  const merged: Json = { ...(restRes.merged as Json) };
  if (treeRes.merged !== undefined) merged.tree = treeRes.merged;
  return {
    merged,
    changes: [...restRes.changes, ...treeRes.changes],
    changed: restRes.changed || treeRes.changed,
  };
}

/** Pass only the defined fields of a partial update through. */
function definedOnly(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/** Products: field-merge the scalar columns and merge variant PRICES keyed by SKU
 *  (docs/55 §7.3) — a tenant's price edit is sacred. */
function mergeProductArtifact(
  base: Json | undefined,
  current: Json,
  incoming: Json,
  resolve: Resolver
): MergeResult {
  const split = (c: Json | undefined): { rest: Json | undefined; variants: Json[] | undefined } => {
    if (!c) return { rest: undefined, variants: undefined };
    const { variants, ...rest } = c;
    return { rest, variants: variants as Json[] | undefined };
  };
  const b = split(base);
  const cu = split(current);
  const inc = split(incoming);
  const restRes = mergeValue(b.rest, cu.rest, inc.rest, { resolve });
  const varRes = mergeByKey(b.variants, cu.variants, inc.variants, 'sku', { resolve }, 'variants');
  const merged: Json = { ...(restRes.merged as Json) };
  if (varRes.merged !== undefined) merged.variants = varRes.merged;
  return {
    merged,
    changes: [...restRes.changes, ...varRes.changes],
    changed: restRes.changed || varRes.changed,
  };
}

// ── asset resolution (shared shape with the installer; find-or-create) ──────────

/** Resolve a blueprint version's assets to MediaAsset ids by URL key. On apply
 *  (`create`) a missing asset is created (hot-link row, mirrors the installer);
 *  on preview it is find-only, so an unseen asset simply resolves to absent. */
async function resolveAssetMap(
  env: Env,
  assets: Blueprint['assets'],
  create: boolean
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (assets.length === 0) return map;
  await withTenant(env.ctx, async (tx) => {
    for (const a of assets) {
      const existing = await tx.mediaAsset.findFirst({
        where: { tenantId: env.tenantId, key: a.url },
        select: { id: true },
      });
      if (existing) {
        map.set(a.id, existing.id);
        continue;
      }
      if (!create) continue;
      const row = await tx.mediaAsset.create({
        data: {
          tenantId: env.tenantId,
          key: a.url,
          originalFilename: `${a.id}.${mimeFromUrl(a.url).split('/')[1] ?? 'jpg'}`,
          mimeType: a.mimeType ?? mimeFromUrl(a.url),
          byteSize: BigInt(0),
          status: 'ready',
          ...(a.width !== undefined ? { width: a.width } : {}),
          ...(a.height !== undefined ? { height: a.height } : {}),
          ...(a.alt !== undefined ? { altText: a.alt } : {}),
        },
        select: { id: true },
      });
      map.set(a.id, row.id);
    }
  });
  return map;
}

// ── theme handler (docs/55 §7.1) ───────────────────────────────────────────────

const themeHandler: KindHandler = {
  kind: 'theme',
  async extractCurrent(env, artifact) {
    if (!artifact.refId) return null;
    const row = await withTenant(env.ctx, (tx) =>
      tx.siteTheme.findUnique({
        where: { id: artifact.refId! },
        select: { name: true, basePresetKey: true, presentation: true, brand: true },
      })
    );
    if (!row) return null;
    return {
      name: row.name,
      basePresetKey: row.basePresetKey,
      presentation: row.presentation ?? {},
      brand: (row.brand ?? null) as Json | null,
    };
  },
  async writeMerged(env, artifact, merged) {
    const id = artifact.refId!;
    await savedThemeService.update(env.ctx, id, {
      name: merged.name,
      presentation: merged.presentation ?? {},
      ...(merged.brand && typeof merged.brand === 'object' ? { brand: merged.brand } : {}),
    });
    // basePresetKey isn't a savedThemeService.update field — write it directly so a
    // changed base preset takes effect (the merge already decided the value).
    if (typeof merged.basePresetKey === 'string') {
      await withTenant(env.ctx, (tx) =>
        tx.siteTheme.update({
          where: { id },
          data: { basePresetKey: merged.basePresetKey as string },
        })
      );
    }
    // Re-apply into the working draft (themeKey + presentation). The site theme is
    // published in the live-republish step (applyUpdate), mirroring go-live.
    await savedThemeService.apply(env.propCtx, id);
  },
};

// ── brand handler (TenantBrand on primary / brand_override on a secondary) ──────

const BRAND_COLORS: [keyof Json, string][] = [
  ['primary', 'colorPrimary'],
  ['primaryForeground', 'colorPrimaryForeground'],
  ['accent', 'colorAccent'],
  ['accentForeground', 'colorAccentForeground'],
  ['secondary', 'colorSecondary'],
  ['secondaryForeground', 'colorSecondaryForeground'],
];

const brandHandler: KindHandler = {
  kind: 'brand',
  // A site's brand is its OWN `brand_override` — the primary included. Reading the
  // primary's from TenantBrand meant a blueprint update diffed against, and wrote
  // back to, the tenant-wide default that every unbranded sibling inherits.
  async extractCurrent(env, _artifact) {
    const prop = await withTenant(env.ctx, (tx) =>
      tx.property.findUnique({
        where: { id: env.propCtx.propertyId },
        select: { brandOverride: true },
      })
    );
    const ov = (prop?.brandOverride ?? {}) as Json;
    if (Object.keys(ov).length === 0) return null;
    const colors: Json = {};
    for (const [k, col] of BRAND_COLORS) {
      if (ov[col] != null) colors[k] = ov[col];
    }
    // NEITHER `businessName` NOR `tagline` is extracted, so neither can be
    // merged, so neither can be written back. See the note on `writeMerged`.
    return compact({
      colors,
      fonts: { heading: ov.fontHeading, body: ov.fontBody },
      // `logoMediaId` is the legacy single-logo key; an override written before the
      // light/dark split still carries the light logo there.
      logoLight: ov.logoLightMediaId ?? ov.logoMediaId ?? undefined,
      logoDark: ov.logoDarkMediaId ?? undefined,
      favicon: ov.faviconMediaId ?? undefined,
    });
  },
  // A template gives you a LOOK. The NAME and the WORDS are the merchant's.
  //
  // The INSTALLER has refused to carry `businessName` and `tagline` since issue
  // 210 — the whole reasoning is written at that spot, including how a shop came
  // to be listed to the public under another shop's name. The UPDATER, its twin,
  // was never given the same rule: it read both fields out of the site's brand
  // override, merged them, and wrote them back.
  //
  // That is worse than it sounds, because of how the merge decides. An automatic
  // resolution always takes THEIRS: if a blueprint's next version changes its
  // sample business name and the merchant never edited hers, "The design your
  // site was built from has been refreshed" RENAMES HER BUSINESS, silently, with
  // no conflict raised for her to see. The tagline does the same, and a sample
  // caterer's slogan on a clothing shop is simply a false statement about it.
  //
  // Neither field is read above and neither is written here, so no path through
  // this handler can carry them. Colors, fonts and the logo are the look, and
  // they are what an update is for.
  async writeMerged(env, _artifact, merged) {
    const colors = (merged.colors ?? {}) as Json;
    const fonts = (merged.fonts ?? {}) as Json;
    const override: Json = {};
    for (const [k, col] of BRAND_COLORS) {
      if (colors[k] != null) override[col] = colors[k];
    }
    if (typeof fonts.heading === 'string') override.fontHeading = fonts.heading;
    if (typeof fonts.body === 'string') override.fontBody = fonts.body;
    if (merged.logoLight != null) override.logoLightMediaId = merged.logoLight;
    if (merged.logoDark != null) override.logoDarkMediaId = merged.logoDark;
    if (merged.favicon != null) override.faviconMediaId = merged.favicon;
    if (Object.keys(override).length === 0) return;
    await withTenant(env.ctx, async (tx) => {
      const prop = await tx.property.findUnique({
        where: { id: env.propCtx.propertyId },
        select: { brandOverride: true },
      });
      const current = (prop?.brandOverride ?? {}) as Json;
      await tx.property.update({
        where: { id: env.propCtx.propertyId },
        data: { brandOverride: { ...current, ...override } as Prisma.InputJsonValue },
      });
    });
  },
};

// ── tree handlers: layout · page · email · component (docs/55 §7.2) ─────────────

/** The site chrome. There is no layout ROW to address any more — the frame is part
 *  of the property's silica site — so this reads and writes it through siteService
 *  rather than by refId (which is null for a frame artifact). */
const frameHandler: KindHandler = {
  kind: 'frame',
  merge: mergeTreeArtifact,
  async extractCurrent(env) {
    const site = await siteService.load(env.propCtx).catch(() => null);
    if (!site?.frame) return null;
    return compact({ tree: site.frame.root });
  },
  async writeMerged(env, _artifact, merged) {
    if (!merged.tree) return;
    await siteService.setFrame(env.propCtx, { root: merged.tree as SilicaNode });
  },
};

const pageHandler: KindHandler = {
  kind: 'page',
  merge: mergeTreeArtifact,
  async extractCurrent(env, artifact) {
    if (!artifact.refId) return null;
    const dto = await pageService.get(env.propCtx, artifact.refId).catch(() => null);
    if (!dto) return null;
    // The BODY comes from the silica site, not the row's legacy `tree` column —
    // that is what the tenant edits and what the storefront serves.
    const site = await siteService.load(env.propCtx).catch(() => null);
    const root = site?.pages.find((pg) => pg.id === artifact.refId)?.root;
    return compact({
      name: dto.name,
      kind: dto.kind,
      recordType: dto.recordType,
      // Page identity (docs/143 Option B) — part of the natural key, never merge-written;
      // carried so base == live-extract stays exact and no false change surfaces.
      recordSubtype: dto.recordSubtype ?? null,
      slug: dto.slug,
      tree: root,
      seoTitle: dto.seoTitle ?? undefined,
      seoDescription: dto.seoDescription ?? undefined,
      canonical: dto.canonical ?? undefined,
      ogImage: dto.ogImage ?? undefined,
      noindex: dto.noindex ?? undefined,
    });
  },
  async writeMerged(env, artifact, merged) {
    if (!artifact.refId) return;
    // kind/recordType/slug are page identity — never merge-written; only content + SEO.
    // The body goes to the silica column; the row keeps the name/SEO metadata.
    await pageService.update(
      env.propCtx,
      artifact.refId,
      definedOnly({
        name: merged.name,
        seoTitle: merged.seoTitle,
        seoDescription: merged.seoDescription,
        canonical: merged.canonical,
        ogImage: merged.ogImage,
        noindex: merged.noindex,
      })
    );
    if (merged.tree) {
      await siteService.setPageRoot(env.propCtx, artifact.refId, merged.tree as SilicaNode);
    }
  },
  async create(env, artifact) {
    // A page the new version added — a bespoke product template a later version
    // introduced, most often. `siteService.addPage` appends it non-destructively and
    // derives the record address for a collection template (`/products/:handle`), so it
    // never collides with Home at the root. A collection template becomes the default for
    // its recordType — the manifest ships record templates as the default, and the resolved
    // content drops `isDefault`, so `kind==='collection'` stands in for it.
    const c = artifact.content;
    const kind = typeof c.kind === 'string' ? c.kind : 'singleton';
    const recordType = typeof c.recordType === 'string' ? c.recordType : null;
    const recordSubtype = typeof c.recordSubtype === 'string' ? c.recordSubtype : null;
    if (!c.tree) return null;
    return siteService.addPage(env.propCtx, {
      name: typeof c.name === 'string' ? c.name : 'Page',
      slug: typeof c.slug === 'string' ? c.slug : '',
      root: c.tree as SilicaNode,
      kind,
      recordType,
      recordSubtype,
      // A per-type product page (docs/143) is never THE default — it wins via subtype.
      isDefault: kind === 'collection' && !recordSubtype,
      seoTitle: typeof c.seoTitle === 'string' ? c.seoTitle : null,
      seoDescription: typeof c.seoDescription === 'string' ? c.seoDescription : null,
      canonical: typeof c.canonical === 'string' ? c.canonical : null,
      ogImage: typeof c.ogImage === 'string' ? c.ogImage : null,
      noindex: typeof c.noindex === 'boolean' ? c.noindex : false,
    });
  },
};

const emailHandler: KindHandler = {
  kind: 'email',
  merge: mergeTreeArtifact,
  async extractCurrent(env, artifact) {
    if (!artifact.refId) return null;
    const dto = await emailService.get(env.ctx, artifact.refId).catch(() => null);
    if (!dto) return null;
    return compact({ name: dto.name, doc: dto.silicaDoc });
  },
  async writeMerged(env, artifact, merged) {
    if (!artifact.refId) return;
    if (merged.doc) await emailService.syncSilica(env.ctx, artifact.refId, { doc: merged.doc });
    await emailService.update(
      env.ctx,
      artifact.refId,
      definedOnly({
        name: merged.name,
      })
    );
  },
};

// ── commerce handlers: category · collection · product (docs/55 §7.3) ───────────

const categoryHandler: KindHandler = {
  kind: 'category',
  async extractCurrent(env, artifact) {
    if (!artifact.refId) return null;
    const row = await categoryService.get(env.ctx, artifact.refId).catch(() => null);
    if (!row) return null;
    return compact({
      handle: row.handle,
      name: row.name,
      description: row.description ?? undefined,
      position: row.position,
      featured: row.featured,
      seoTitle: row.seoTitle ?? undefined,
      seoDescription: row.seoDescription ?? undefined,
    });
  },
  async writeMerged(env, artifact, merged) {
    if (!artifact.refId) return;
    await categoryService.update(
      env.ctx,
      artifact.refId,
      definedOnly({
        name: merged.name,
        description: merged.description,
        featured: merged.featured,
        seoTitle: merged.seoTitle,
        seoDescription: merged.seoDescription,
      })
    );
  },
};

const collectionHandler: KindHandler = {
  kind: 'collection',
  async extractCurrent(env, artifact) {
    if (!artifact.refId) return null;
    const row = await withTenant(env.ctx, (tx) =>
      tx.productCollection.findFirst({
        where: { id: artifact.refId!, deletedAt: null },
        select: {
          handle: true,
          name: true,
          description: true,
          featured: true,
          seoTitle: true,
          seoDescription: true,
        },
      })
    );
    if (!row) return null;
    return compact({
      handle: row.handle,
      name: row.name,
      description: row.description ?? undefined,
      featured: row.featured,
      seoTitle: row.seoTitle ?? undefined,
      seoDescription: row.seoDescription ?? undefined,
    });
  },
  async writeMerged(env, artifact, merged) {
    if (!artifact.refId) return;
    await collectionService.update(
      env.ctx,
      artifact.refId,
      definedOnly({
        name: merged.name,
        description: merged.description,
        featured: merged.featured,
        seoTitle: merged.seoTitle,
        seoDescription: merged.seoDescription,
      })
    );
  },
};

const productHandler: KindHandler = {
  kind: 'product',
  merge: mergeProductArtifact,
  async extractCurrent(env, artifact) {
    if (!artifact.refId) return null;
    const row = await withTenant(env.ctx, (tx) =>
      tx.product.findFirst({
        where: { id: artifact.refId!, deletedAt: null },
        select: {
          handle: true,
          title: true,
          description: true,
          status: true,
          productType: true,
          productTypeKey: true,
          attributes: true,
          vendor: true,
          tags: true,
          fulfillmentType: true,
          weightGrams: true,
          taxClass: true,
          requiresShipping: true,
          seoTitle: true,
          seoDescription: true,
          variants: {
            where: { deletedAt: null },
            select: { sku: true, priceCents: true, compareAtPriceCents: true, costCents: true },
          },
        },
      })
    );
    if (!row) return null;
    return compact({
      handle: row.handle,
      title: row.title,
      description: row.description ?? undefined,
      status: row.status,
      productType: row.productType ?? undefined,
      productTypeKey: row.productTypeKey ?? undefined,
      // Only carry a non-empty attribute bag into the merge surface, so an untyped
      // product's `{}` doesn't read as a field the tenant "cleared".
      attributes:
        row.attributes && Object.keys(row.attributes).length > 0 ? row.attributes : undefined,
      vendor: row.vendor ?? undefined,
      tags: row.tags,
      fulfillmentType: row.fulfillmentType,
      weight: row.weightGrams ?? undefined,
      taxClass: row.taxClass ?? undefined,
      requiresShipping: row.requiresShipping,
      seoTitle: row.seoTitle ?? undefined,
      seoDescription: row.seoDescription ?? undefined,
      variants: row.variants.map((v) =>
        compact({
          sku: v.sku,
          priceCents: v.priceCents,
          compareAtPriceCents: v.compareAtPriceCents ?? undefined,
          costCents: v.costCents ?? undefined,
        })
      ),
    });
  },
  async writeMerged(env, artifact, merged) {
    if (!artifact.refId) return;
    await productService.update(
      env.ctx,
      artifact.refId,
      definedOnly({
        title: merged.title,
        description: merged.description,
        status: merged.status,
        productType: merged.productType,
        productTypeKey: merged.productTypeKey,
        attributes: merged.attributes,
        vendor: merged.vendor,
        tags: merged.tags,
        fulfillmentType: merged.fulfillmentType,
        weight: merged.weight,
        taxClass: merged.taxClass,
        requiresShipping: merged.requiresShipping,
        seoTitle: merged.seoTitle,
        seoDescription: merged.seoDescription,
      })
    );
    // Variant prices, correlated by SKU.
    for (const v of (merged.variants ?? []) as Json[]) {
      const sku = v.sku as string | undefined;
      if (!sku) continue;
      const live = await variantService.getBySku(env.ctx, sku).catch(() => null);
      if (!live) continue;
      await variantService.update(
        env.ctx,
        live.id,
        definedOnly({
          priceCents: v.priceCents,
          compareAtPriceCents: v.compareAtPriceCents,
          costCents: v.costCents,
        })
      );
    }
  },
};

// ── content handler (docs/55 §7.3) — body merged per top-level field ────────────

const contentHandler: KindHandler = {
  kind: 'content',
  async extractCurrent(env, artifact) {
    if (!artifact.refId) return null;
    const row = await withTenant(env.ctx, (tx) =>
      tx.contentEntry.findFirst({
        where: { id: artifact.refId! },
        select: { typeKey: true, slug: true, status: true, body: true, seoJson: true },
      })
    );
    if (!row) return null;
    return compact({
      typeKey: row.typeKey,
      slug: row.slug,
      status: row.status,
      body: row.body ?? {},
      seo: row.seoJson ?? {},
    });
  },
  async writeMerged(env, artifact, merged) {
    if (!artifact.refId) return;
    const entryId = artifact.refId;
    await withTenant(env.ctx, async (tx) => {
      const type = await resolveType(tx, merged.typeKey as string);
      const schema = parseTypeSchema(type);
      const body = validateAndNormalizeBody(schema, merged.body ?? {});
      const seo = (merged.seo ?? {}) as Record<string, unknown>;
      const status = (merged.status as string) ?? 'draft';
      // An update can carry a draft → published transition, and a published row needs a
      // date (issue 376). Reading the current one first keeps the ORIGINAL publish date
      // on an entry that was already live: a blueprint update is an edit to the words,
      // not a republish, so it must not re-date the post.
      const current = await tx.contentEntry.findFirst({
        where: { id: entryId },
        select: { publishedAt: true },
      });
      await tx.contentEntry.update({
        where: { id: entryId },
        data: {
          body: body as Prisma.InputJsonValue,
          seoJson: seo as Prisma.InputJsonValue,
          status,
          publishedAt: publishTimestamp(status, current?.publishedAt),
        },
      });
      await syncReferences(tx, env.tenantId, entryId, schema, body);
      await recordRevision(tx, {
        tenantId: env.tenantId,
        entryId,
        body,
        seoJson: seo,
        status,
        kind: 'manual',
        authorId: env.ctx.userId ?? null,
        summary: 'Blueprint update',
      });
    });
  },
};

/** Handler registry — kinds grow per slice (docs/55 §12). */
const HANDLERS: KindHandler[] = [
  themeHandler,
  brandHandler,
  frameHandler,
  pageHandler,
  emailHandler,
  categoryHandler,
  collectionHandler,
  productHandler,
  contentHandler,
];
const HANDLED_KINDS = new Set<ArtifactKind>(HANDLERS.map((h) => h.kind));

// ── shared diff/merge pass ──────────────────────────────────────────────────────

interface Processed {
  diffs: ArtifactDiff[];
  pending: { handler: KindHandler; artifact: ResolvedArtifact; merged: Json }[];
  incomingHandled: ResolvedArtifact[];
  /** Artifacts the new version added that this install lacked, now created (apply only).
   *  Each carries the fresh row id in `refId` so the caller can extend the install's
   *  id-map — without which uninstall would orphan them and a later update would re-create
   *  them. */
  created: ResolvedArtifact[];
}

async function processUpdate(
  env: Env,
  install: InstallRowLite,
  incoming: Blueprint,
  takeTheirs: Set<string>
): Promise<Processed> {
  const result = (install.result ?? {}) as InstallResult;
  const assetMap = await resolveAssetMap(env, incoming.assets, env.write);
  const incomingArtifacts = resolveBlueprintArtifacts(incoming, result, assetMap, {
    sampleData: install.sampleData,
  });
  const baselines = await loadBaselines(env.ctx, install.id);

  const diffs: ArtifactDiff[] = [];
  const pending: Processed['pending'] = [];
  const incomingHandled: ResolvedArtifact[] = [];
  const created: ResolvedArtifact[] = [];
  const seen = new Set<string>();

  for (const handler of HANDLERS) {
    for (const a of incomingArtifacts) {
      if (a.kind !== handler.kind) continue;
      const key = `${a.kind}:${a.naturalKey}`;
      seen.add(key);
      const base = baselines.get(key);

      if (base?.detached) {
        diffs.push({
          kind: a.kind,
          naturalKey: a.naturalKey,
          refId: base.refId,
          status: 'detached',
          changes: [],
        });
        continue;
      }
      if (!base) {
        // New upstream artifact — one this version added that the install never had.
        // On APPLY, create it through the handler (a page most often) and track it so the
        // baseline + id-map advance; on PREVIEW (`!env.write`), or for a kind with no
        // `create`, just surface it. The always-present theme/brand never reach here.
        let newRefId: string | null = null;
        if (env.write && handler.create) {
          // Best-effort: a create that throws leaves the artifact reported-but-unmade
          // rather than failing the whole update (mirrors the merged-write loop).
          newRefId = await handler.create(env, a).catch(() => null);
          if (newRefId) {
            const resolved: ResolvedArtifact = { ...a, refId: newRefId };
            incomingHandled.push(resolved);
            created.push(resolved);
          }
        }
        diffs.push({
          kind: a.kind,
          naturalKey: a.naturalKey,
          refId: newRefId,
          status: 'new',
          changes: [],
        });
        continue;
      }

      const current = await handler.extractCurrent(env, { ...a, refId: base.refId });
      if (current == null) {
        diffs.push({
          kind: a.kind,
          naturalKey: a.naturalKey,
          refId: base.refId,
          status: 'tenant_deleted',
          changes: [],
        });
        continue;
      }

      const localTake = new Set<string>();
      for (const id of takeTheirs) {
        if (id.startsWith(`${key}#`)) localTake.add(id.slice(key.length + 1));
      }
      const resolve = resolverFrom(localTake);
      const r = handler.merge
        ? handler.merge(base.baseline, current, a.content, resolve)
        : mergeValue(base.baseline, current, a.content, { resolve });
      const changes = r.changes.map((c) => ({ ...c, id: `${key}#${c.path}` }));
      const status: ArtifactDiff['status'] =
        changes.length === 0
          ? 'unchanged'
          : changes.some((c) => c.type === 'conflict')
            ? 'conflict'
            : 'updated';
      diffs.push({ kind: a.kind, naturalKey: a.naturalKey, refId: base.refId, status, changes });
      incomingHandled.push({ ...a, refId: base.refId });
      if (r.changed)
        pending.push({ handler, artifact: { ...a, refId: base.refId }, merged: r.merged as Json });
    }
  }

  // Orphans: a managed baseline of a handled kind that the new version dropped.
  for (const [key, base] of baselines) {
    if (!HANDLED_KINDS.has(base.kind) || seen.has(key) || base.detached || !base.managed) continue;
    diffs.push({
      kind: base.kind,
      naturalKey: base.naturalKey,
      refId: base.refId,
      status: 'removed',
      changes: [],
    });
  }

  return { diffs, pending, incomingHandled, created };
}

function summarize(diffs: ArtifactDiff[]): UpdatePlan['summary'] {
  let updated = 0;
  let conflicts = 0;
  let auto = 0;
  let neu = 0;
  let removed = 0;
  for (const d of diffs) {
    if (d.status === 'new') neu += 1;
    if (d.status === 'removed') removed += 1;
    if (d.status === 'updated' || d.status === 'conflict') updated += 1;
    for (const c of d.changes) {
      if (c.type === 'conflict') conflicts += 1;
      else auto += 1;
    }
  }
  return { updated, conflicts, auto, new: neu, removed };
}

async function buildEnv(uctx: UpdateContext, write: boolean): Promise<Env> {
  const ctx = { tenantId: uctx.tenantId, userId: uctx.userId ?? undefined };
  const prop = await withTenant(ctx, (tx) =>
    tx.property.findUnique({ where: { id: uctx.propertyId }, select: { isPrimary: true } })
  );
  return {
    tenantId: uctx.tenantId,
    ctx,
    propCtx: {
      tenantId: uctx.tenantId,
      userId: uctx.userId ?? undefined,
      propertyId: uctx.propertyId,
    },
    isPrimary: prop?.isPrimary ?? true,
    write,
  };
}

// ── public API ──────────────────────────────────────────────────────────────────

/** Preview: build the changeset for the catalog's current version without writing. */
export async function planUpdate(
  uctx: UpdateContext,
  install: InstallRowLite,
  incoming: Blueprint
): Promise<UpdatePlan> {
  const env = await buildEnv(uctx, false);
  const { diffs } = await processUpdate(env, install, incoming, new Set());
  return {
    installId: install.id,
    blueprintKey: install.blueprintKey,
    fromVersion: install.blueprintVersion,
    toVersion: incoming.version,
    updatable: incoming.version !== install.blueprintVersion,
    artifacts: diffs,
    summary: summarize(diffs),
  };
}

/** Apply: merge + write through the service layer, re-publish a live install, then
 *  advance the handled baselines + the install version (docs/55 §6). */
export async function applyUpdate(
  uctx: UpdateContext,
  install: InstallRowLite,
  incoming: Blueprint,
  takeTheirs: string[]
): Promise<ApplyResult> {
  const env = await buildEnv(uctx, true);
  const { diffs, pending, incomingHandled, created } = await processUpdate(
    env,
    install,
    incoming,
    new Set(takeTheirs)
  );

  let applied = 0;
  for (const p of pending) {
    try {
      await p.handler.writeMerged(env, p.artifact, p.merged);
      applied += 1;
    } catch (err) {
      uctx.logger.warn(
        { err, kind: p.artifact.kind, key: p.artifact.naturalKey },
        'blueprint update: artifact write failed'
      );
    }
  }

  // Extend the install's id-map with anything the update CREATED, so uninstall tears it
  // down and a later update finds it by refId instead of re-creating it. Pages are the
  // only creatable kind today; the entry shape matches what the installer records (slug
  // taken from the content verbatim — null for a record template — so its natural key is
  // identical to a fresh install's).
  if (created.length > 0) {
    const result = (install.result ?? {}) as InstallResult;
    result.pages = result.pages ?? [];
    for (const c of created) {
      if (c.kind !== 'page' || !c.refId) continue;
      const content = c.content;
      result.pages.push({
        name: typeof content.name === 'string' ? content.name : 'Page',
        id: c.refId,
        recordType: typeof content.recordType === 'string' ? content.recordType : null,
        recordSubtype: typeof content.recordSubtype === 'string' ? content.recordSubtype : null,
        slug: typeof content.slug === 'string' ? content.slug : null,
      });
      applied += 1;
    }
    await withTenant(env.ctx, (tx) =>
      tx.tenantBlueprintInstall.update({
        where: { id: install.id },
        data: { result: result as unknown as Prisma.InputJsonValue },
      })
    );
  }

  // Re-publish a LIVE install so the update reaches the storefront (brand is read live
  // and needs no publish). A draft install stays draft for the tenant to publish on their
  // own schedule (docs/55 §6). BOTH publishes are needed and they cover different columns:
  // `siteService.publish` copies the silica page drafts (the merged edits AND any page this
  // update CREATED) into the published columns the storefront serves — `publishNow` only
  // snapshots the sitebuilder config/theme, so a page change would otherwise never go live.
  // This is exactly the pair `goLiveInstall` runs.
  if (install.status === 'live' && applied > 0) {
    await siteService
      .publish(env.propCtx)
      .catch((err) =>
        uctx.logger.warn({ err, installId: install.id }, 'update page publish failed')
      );
    await publishService
      .publishNow(env.propCtx, { note: `Blueprint update ${incoming.version} (${install.id})` })
      .catch((err) => uctx.logger.warn({ err, installId: install.id }, 'update republish failed'));
  }

  // Advance the handled baselines to the new version (the new ancestor) so the next
  // update measures drift from here, and bump the install's recorded version.
  await captureBaselines(env.ctx, install.id, incoming.version, incomingHandled);
  await withTenant(env.ctx, (tx) =>
    tx.tenantBlueprintInstall.update({
      where: { id: install.id },
      data: { blueprintVersion: incoming.version },
    })
  );

  uctx.logger.info(
    { installId: install.id, from: install.blueprintVersion, to: incoming.version, applied },
    'blueprint update applied'
  );

  const conflicts = diffs.reduce(
    (n, d) => n + d.changes.filter((c) => c.type === 'conflict').length,
    0
  );
  return {
    installId: install.id,
    fromVersion: install.blueprintVersion,
    toVersion: incoming.version,
    applied,
    conflicts,
    artifacts: diffs,
  };
}
