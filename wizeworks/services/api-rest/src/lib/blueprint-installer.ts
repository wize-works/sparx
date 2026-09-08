// Tenant blueprint installer (docs/54 §5) — replays a declarative Blueprint
// manifest through the existing service layer to provision a whole themed tenant:
// brand identity + a shipped SiteTheme, CMS content, a commerce catalog, builder
// pages + the site layout, tenant components, and marketing emails. Everything
// is created as DRAFT (docs/54 D4); `goLiveInstall` publishes it on the tenant's
// explicit "go live".
//
// Synchronous for now (called straight from the route). The doc's target is an
// async `template-installer` Cloud Run worker on `template.install`; this code is
// structured (one pure-ish function, services do their own withTenant) so it can
// move into that worker unchanged later.
//
// Reference resolution: the manifest links by handle/asset-id; this builds an id
// map slice by slice (assets → brand/theme → content → commerce → components →
// pages/layout → emails) so every later reference resolves to a real UUID.

import type { FastifyBaseLogger } from 'fastify';

import { Prisma, withTenant } from '@wizeworks/db';
import { listEnabledModules, type ModuleSlug } from '@wizeworks/auth';
import {
  categoryService,
  collectionService,
  productService,
  variantService,
} from '@wizeworks/commerce';
import { emailService, pageService, siteService } from '@wizeworks/builder';
import { createSequence, updateSequence, deleteSequence } from '@wizeworks/email-sequences';
import { publishService, savedThemeService } from '@wizeworks/sitebuilder';
import {
  createBookingPolicy,
  createLocation,
  createResource,
  createService,
  setAvailabilityWindows,
} from '@wizeworks/scheduling';
import {
  CreateBookingPolicyInput,
  CreateResourceInput,
  CreateServiceInput,
} from '@wizeworks/scheduling-schemas';
import {
  parseTypeSchema,
  publishTimestamp,
  resolveType,
  validateAndNormalizeBody,
  recordRevision,
  syncReferences,
} from '@wizeworks/cms';
import { publish } from '@wizeworks/api-core/pubsub';
import { isAssetRef, type Blueprint } from '@wizeworks/blueprints';
import { decodeBindingRef, encodeBindingRef, type SilicaNode } from '@wizeworks/builder-schemas';

import { captureBaselines, resolveBlueprintArtifacts } from './blueprint-baseline.js';

/** What the person installing chose, as distinct from what the design declares. */
export interface InstallOptions {
  /**
   * Bring the design's EXAMPLES — its products, its articles, its example salon
   * with its example stylists (issue 098). True is the default and the answer
   * almost everyone wants: a console with nothing in it does not teach a new
   * owner what the screens are for.
   *
   * False takes the structure alone — the look, the pages, the chrome, the email
   * designs, the shelves without the stock. The choice is recorded on the install
   * row, because the backfill and the updater both ask it again later.
   */
  sampleData?: boolean;
}

export interface InstallContext {
  tenantId: string;
  userId: string | null;
  /** The property to install into — always the tenant's PRIMARY (docs/54 D6); the
   *  route resolves it via resolvePrimaryPropertyId. */
  propertyId: string;
  logger: FastifyBaseLogger;
}

/** The id map + counts recorded on the install row — powers the review surface
 *  and go-live (publishing exactly what was created). */
export interface InstallResult {
  assets: Record<string, string>; // manifest asset id → MediaAsset id
  categories: Record<string, string>; // handle → id
  collections: Record<string, string>; // handle → id
  /** The handles this install actually MINTED, of the maps above.
   *
   *  The maps hold everything the install USES — including rows it reconciled onto by
   *  natural key, which the commerce slice has always done (`reuseOrRestore*`). Uninstall
   *  read those maps and removed every id in them, so removing a design from one site
   *  deleted the categories and collections a SIBLING site was still selling from.
   *
   *  ABSENT (an install row written before this shipped) means "assume minted", i.e. the
   *  old behaviour. That is safe rather than lossy for real rows: until the theme and
   *  content collisions were fixed, a second site's install failed in the theme slice —
   *  which runs BEFORE commerce — so no pre-existing row can contain commerce rows
   *  reconciled across two sites. Reuse before then only happened reinstalling onto the
   *  SAME site, where deleting is correct. */
  mintedCategories?: string[];
  mintedCollections?: string[];
  /** `reused: true` — the product already existed under this handle and the install only
   *  wired it into this site (`linkProductRelations`). Uninstall unlinks it from the site
   *  instead of soft-deleting a product another site still sells. */
  products: { handle: string; id: string; reused?: boolean }[];
  theme: { id: string; name: string } | null;
  pages: {
    name: string;
    id: string;
    recordType: string | null;
    recordSubtype: string | null;
    slug: string | null;
  }[];
  emails: { name: string; id: string }[];
  sequences: { name: string; id: string }[];
  /** Every entry this install USES — created or already present. `reused: true` means
   *  the entry was already in the tenant (matched by its natural key) and this install
   *  only linked it to the site, so uninstall must unlink rather than delete it: the
   *  sibling site that installed the same design is still showing it. Both kinds stay
   *  in this list because pin resolution needs to map every slug to an id. */
  content: {
    typeKey: string;
    slug: string | null;
    id: string;
    /** The manifest's status. Absent on results recorded before this was carried. */
    declaredStatus?: string;
    reused?: boolean;
  }[];
  /** Booking-backed service business (docs/79) — the id-map for the scheduling
   *  slice. Null until an install with a `scheduling` decl runs it; `services` is
   *  what the backfill's `isMaterialized` gate reads. */
  scheduling: {
    /** handle → BusinessLocation id. Absent on an install row written before a
     *  blueprint could declare its own premises; everything filed at the tenant's
     *  seeded 'Main location' then, which is what an empty map means. */
    locations?: Record<string, string>;
    policies: Record<string, string>; // handle → BookingPolicy id
    resources: Record<string, string>; // handle → SchedulingResource id
    services: { handle: string; id: string }[];
  } | null;
  counts: Record<string, number>;
}

/** Resolve handle-addressed ENTITY PINS to the real row ids (docs/103).
 *
 *  A blueprint addresses records by stable HANDLE because it cannot know the row ids
 *  until install mints them. For silica this is a much smaller job than it was for the
 *  legacy trees, because most silica refs never need rewriting at all: a collection
 *  bind reads `commerce.category.<handle>` / `cms.<type>`, and the storefront builds
 *  its data root under those same handle keys — so the ref an author wrote is already
 *  the ref that resolves.
 *
 *  What DOES need mapping is an entity PIN (docs/98 Pillar 7) — `{ entity, id }`,
 *  which addresses one specific record and is hydrated under the reserved `__pins`
 *  root by real id. Those are rewritten here from handle (a product handle, or a
 *  content-entry slug) to the id this install created.
 *
 *  A pin whose handle matches nothing is LEFT ALONE: it is either already a real id
 *  (a captured site being reinstalled into the tenant it came from) or a dangling
 *  reference, and silently blanking it would turn a pinned record into an empty
 *  block with no diagnostic. Returns a fresh tree; the manifest is never mutated. */
export function resolveBindingHandles(tree: SilicaNode, result: InstallResult): SilicaNode {
  const products: Record<string, string> = {};
  for (const p of result.products ?? []) products[p.handle] = p.id;
  const entries: Record<string, string> = {};
  for (const c of result.content ?? []) if (c.slug) entries[c.slug] = c.id;
  const byEntity: Record<string, Record<string, string>> = {
    commerce: products,
    cms: entries,
  };

  const walk = (n: SilicaNode): SilicaNode => {
    const rec = { ...(n as unknown as Record<string, unknown>) };
    const data = rec.data as { ref?: unknown } | undefined;
    if (data && typeof data.ref === 'string') {
      const binding = decodeBindingRef(data.ref);
      if (binding.entity && binding.id) {
        const mapped = byEntity[binding.entity]?.[binding.id];
        if (mapped) {
          rec.data = { ...data, ref: encodeBindingRef({ ...binding, id: mapped }) };
        }
      }
    }
    const children: unknown = rec.children;
    if (Array.isArray(children)) {
      // Text children are bare strings — pass them through untouched.
      rec.children = (children as unknown[]).map((c) =>
        typeof c === 'object' && c !== null ? walk(c as SilicaNode) : c
      );
    }
    return rec as unknown as SilicaNode;
  };
  return walk(tree);
}

// ── small helpers ──────────────────────────────────────────────────────────────

/** Replace every `{ $asset: id }` sentinel in a JSON value (deep) with the
 *  installed MediaAsset's UUID — content-body asset fields validate as a uuid
 *  string (cms-schemas). Unknown refs collapse to null (the field is optional);
 *  integrity validation already guarantees they resolve. */
function resolveAssetRefs(value: unknown, assets: Map<string, string>): unknown {
  if (isAssetRef(value)) return assets.get(value.$asset) ?? null;
  if (Array.isArray(value)) return value.map((v) => resolveAssetRefs(v, assets));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveAssetRefs(v, assets);
    }
    return out;
  }
  return value;
}

export function mimeFromUrl(url: string): string {
  // A self-contained `data:` asset declares its own mediatype — read it directly
  // rather than guessing from a (non-existent) file extension.
  if (url.startsWith('data:')) {
    return /^data:([^;,]+)/.exec(url)?.[1] ?? 'application/octet-stream';
  }
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'avif':
      return 'image/avif';
    default:
      return 'image/jpeg';
  }
}

// Install provisions ONLY into modules the tenant has ENABLED — it NEVER writes
// `settings.modules` (the locked provisioning invariant: only the user flips a
// module flag, never a blueprint/preset/starter). Onboarding is modules-FIRST, so
// by install time the tenant's modules are already chosen; a blueprint that needs a
// module the tenant didn't enable simply SKIPS that slice (a disabled-module slice
// inserts nothing — CLAUDE.md "a disabled module stores no rows"). Each slice below
// gates on `enabled`. Builder is the hosted-site module: pages/layout/components
// are skipped without it (a headless tenant gets no site rows); commerce →
// `commerce`, content → `cms`, emails → `email`. Brand + theme are tenant identity
// + look, applied regardless (they write no module-scoped business rows and re-theme
// every surface, email included). The marketplace/onboarding surfaces a blueprint's
// `requiresModules` so the tenant can enable what they want rendered before install.
function moduleGate(enabled: ModuleSlug[]): (m: ModuleSlug) => boolean {
  const set = new Set(enabled);
  return (m) => set.has(m);
}

// ── commerce reconcile-by-natural-key ─────────────────────────────────────────────
//
// Install is idempotent and ADDITIVE, not destroy-and-recreate. Every commerce row is
// matched by its stable natural key (category/collection/product handle, variant SKU):
// an existing row is REUSED as-is, a prior reset's soft-deleted tombstone is RESTORED
// in place, and only a genuinely-absent row is created. This is also the only correct
// path: `product_variants_sku_unique (tenant_id, sku)` reserves a SKU even while
// soft-deleted, and a cart line pins the variant (`onDelete: Restrict`) — so a SKU that
// already exists can NEVER be freed by deletion, only reused. Reusing leaves the
// tenant's catalog untouched and makes reinstall safe to re-run.

interface ReconcileCtx {
  tenantId: string;
  userId?: string;
}

/** Reuse a live product by handle, else restore a tombstone, else null (caller creates). */
async function reuseOrRestoreProduct(ctx: ReconcileCtx, handle: string): Promise<string | null> {
  const tenantId = ctx.tenantId;
  const live = await withTenant(ctx, (tx) =>
    tx.product.findFirst({ where: { tenantId, handle, deletedAt: null }, select: { id: true } })
  );
  if (live) return live.id;
  const dead = await withTenant(ctx, (tx) =>
    tx.product.findFirst({
      where: { tenantId, handle, deletedAt: { not: null } },
      select: { id: true },
    })
  );
  if (!dead) return null;
  await productService.restore(ctx, dead.id); // clears the tombstone + restores variants
  return dead.id;
}

/** Reuse a live variant by SKU, else restore its tombstone, else null. The SKU is
 *  globally unique per tenant, so there is at most one row to find. */
async function reuseOrRestoreVariant(ctx: ReconcileCtx, sku: string): Promise<string | null> {
  const tenantId = ctx.tenantId;
  const row = await withTenant(ctx, (tx) =>
    tx.productVariant.findFirst({
      where: { tenantId, sku },
      select: { id: true, deletedAt: true },
    })
  );
  if (!row) return null;
  if (row.deletedAt) await variantService.restore(ctx, row.id);
  return row.id;
}

/** Reuse a live category by handle, else restore its tombstone, else null. No service
 *  `restore` exists for categories, so the tombstone is cleared in place. */
async function reuseOrRestoreCategory(ctx: ReconcileCtx, handle: string): Promise<string | null> {
  const tenantId = ctx.tenantId;
  return withTenant(ctx, async (tx) => {
    const row = await tx.productCategory.findFirst({
      where: { tenantId, handle },
      select: { id: true, deletedAt: true },
    });
    if (!row) return null;
    if (row.deletedAt)
      await tx.productCategory.update({ where: { id: row.id }, data: { deletedAt: null } });
    return row.id;
  });
}

/**
 * Widen an ALREADY-SCOPED category/collection to also show on this site.
 *
 * Model B (docs/49 §3): NO junction rows means "visible on every site". So a row that
 * currently has none is GLOBAL, and adding a link to it would NARROW it — hiding it
 * from every sibling site that is showing it today. That is the opposite of what an
 * install should ever do, so this is deliberately a no-op in that case: reusing a global
 * row leaves it global.
 *
 * Where the row IS already scoped, adding this site is purely additive and is what makes
 * "add this design to another site" show the catalogue on the new site too.
 */
async function widenScopeIfScoped(
  ctx: ReconcileCtx,
  propertyId: string,
  kind: 'category' | 'collection',
  id: string
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    if (kind === 'category') {
      const links = await tx.categoryProperty.count({ where: { categoryId: id } });
      if (links === 0) return;
      await tx.categoryProperty.createMany({
        data: [{ categoryId: id, propertyId }],
        skipDuplicates: true,
      });
      return;
    }
    const links = await tx.collectionProperty.count({ where: { collectionId: id } });
    if (links === 0) return;
    await tx.collectionProperty.createMany({
      data: [{ collectionId: id, propertyId }],
      skipDuplicates: true,
    });
  });
}

/** Reuse a live collection by handle, else restore its tombstone, else null. */
async function reuseOrRestoreCollection(ctx: ReconcileCtx, handle: string): Promise<string | null> {
  const tenantId = ctx.tenantId;
  return withTenant(ctx, async (tx) => {
    const row = await tx.productCollection.findFirst({
      where: { tenantId, handle },
      select: { id: true, deletedAt: true },
    });
    if (!row) return null;
    if (row.deletedAt)
      await tx.productCollection.update({ where: { id: row.id }, data: { deletedAt: null } });
    return row.id;
  });
}

/** Seed a REUSED product's blueprint relationships — category + collection membership
 *  and site scope — additively (`skipDuplicates`, so the tenant's own links are never
 *  removed). Reusing the product row avoids a SKU collision, but the blueprint still
 *  needs its products WIRED INTO the categories/collections the bound grids read from;
 *  a prior reset that hard-purged a category cascades its joins away, so a reused
 *  product can come back unlinked. Mirrors the create path's linking (product-service
 *  `create`). `isPrimary` is only claimed when the product currently has no category. */
async function linkProductRelations(
  ctx: ReconcileCtx,
  productId: string,
  categoryIds: string[],
  collectionIds: string[],
  propertyId: string
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    if (categoryIds.length > 0) {
      const existingCats = await tx.categoryProduct.count({ where: { productId } });
      await tx.categoryProduct.createMany({
        data: categoryIds.map((categoryId, idx) => ({
          categoryId,
          productId,
          isPrimary: existingCats === 0 && idx === 0,
          position: idx,
        })),
        skipDuplicates: true,
      });
    }
    if (collectionIds.length > 0) {
      await tx.collectionProduct.createMany({
        data: collectionIds.map((collectionId, idx) => ({
          collectionId,
          productId,
          position: idx,
          addedBy: 'manual',
        })),
        skipDuplicates: true,
      });
    }
    await tx.productProperty.createMany({
      data: [{ propertyId, productId }],
      skipDuplicates: true,
    });
  });
}

/** Re-link a REUSED product's images to the CURRENT media assets. A reused product
 *  keeps the `VariantImage` rows from a PRIOR install, but a reset HARD-deletes the
 *  media assets those rows point at and this install re-creates them with FRESH ids —
 *  so the stored `mediaAssetId` 404s on the storefront (the card renders its alt, no
 *  photo). Surgical + reconcile-safe: drop only the image rows whose asset no longer
 *  exists (the dangling ones), then add the blueprint's images against the freshly
 *  installed assets, idempotently (skip an asset the product already shows). A
 *  tenant's own valid product images are left untouched. `images` is pre-resolved to
 *  live `mediaAssetId`s + the reused product's variant ids. */
async function relinkProductImages(
  ctx: ReconcileCtx,
  productId: string,
  images: {
    mediaAssetId: string;
    variantId?: string;
    position?: number;
    alt?: string;
    isPrimary?: boolean;
  }[]
): Promise<void> {
  // Drop dangling image rows (mediaAssetId points at an asset a prior reset removed).
  await withTenant(ctx, async (tx) => {
    const rows = await tx.variantImage.findMany({
      where: { productId },
      select: { id: true, mediaAssetId: true },
    });
    if (rows.length === 0) return;
    const assetIds = [...new Set(rows.map((r) => r.mediaAssetId))];
    const alive = new Set(
      (await tx.mediaAsset.findMany({ where: { id: { in: assetIds } }, select: { id: true } })).map(
        (a) => a.id
      )
    );
    const staleIds = rows.filter((r) => !alive.has(r.mediaAssetId)).map((r) => r.id);
    if (staleIds.length > 0) {
      await tx.variantImageOptionValue.deleteMany({ where: { variantImageId: { in: staleIds } } });
      await tx.variantImage.deleteMany({ where: { id: { in: staleIds } } });
    }
  });
  // Add the blueprint's images, skipping any the product already shows (idempotent).
  for (const img of images) {
    const existing = await withTenant(ctx, (tx) =>
      tx.variantImage.findFirst({
        where: { productId, mediaAssetId: img.mediaAssetId },
        select: { id: true },
      })
    );
    const id =
      existing?.id ??
      (
        await variantService.addImage(ctx, {
          productId,
          variantId: img.variantId,
          mediaAssetId: img.mediaAssetId,
          position: img.position,
          alt: img.alt,
          optionValueIds: [],
        })
      ).id;
    if (img.isPrimary) await variantService.setPrimaryImage(ctx, id);
  }
}

// ── install ─────────────────────────────────────────────────────────────────────

/** Already-installed guard. Returns the existing row (any status) or null. */
export async function findInstall(
  tenantId: string,
  propertyId: string,
  blueprintKey: string
): Promise<{ id: string; status: string } | null> {
  return withTenant({ tenantId }, (tx) =>
    tx.tenantBlueprintInstall.findFirst({
      where: { propertyId, blueprintKey },
      select: { id: true, status: true },
    })
  );
}

export async function installBlueprint(
  ctxIn: InstallContext,
  blueprint: Blueprint,
  options: InstallOptions = {}
): Promise<{ installId: string; result: InstallResult }> {
  const { tenantId, userId, propertyId, logger } = ctxIn;
  const sampleData = options.sampleData ?? true;
  const ctx = { tenantId, userId: userId ?? undefined };
  const propCtx = { tenantId, userId: userId ?? undefined, propertyId };

  const result: InstallResult = {
    assets: {},
    categories: {},
    collections: {},
    // Initialised EMPTY, never left undefined. Uninstall reads "absent" as "this row
    // predates minted-tracking, assume minted" — so a genuinely empty list has to be an
    // empty ARRAY. Leaving it undefined made the second site's uninstall (which mints
    // nothing, because it reconciles onto the first site's rows) take the legacy path
    // and delete the very rows this tracking exists to protect.
    mintedCategories: [],
    mintedCollections: [],
    products: [],
    theme: null,
    pages: [],
    emails: [],
    sequences: [],
    content: [],
    scheduling: null,
    counts: {},
  };
  const assetMap = new Map<string, string>();

  // Declared outside the try so the catch can flip the row to `failed`.
  let installId: string | null = null;

  try {
    // Install row FIRST, as `running` — a partial failure is then recorded (with its
    // partial id-map) for Reset & reinstall, never silently orphaned. The route
    // guarantees no prior row for (tenant, property, blueprint): an installed/live one
    // returns 409, a failed/running one must be reset first (docs/54 §5, D8).
    const installRow = await withTenant(ctx, (tx) =>
      tx.tenantBlueprintInstall.create({
        data: {
          tenantId,
          propertyId,
          blueprintKey: blueprint.key,
          blueprintVersion: blueprint.version,
          status: 'running',
          // Recorded with the row, not just acted on — the backfill reads it back
          // when a module is enabled months from now (issue 098).
          sampleData,
          result: {},
        },
        select: { id: true },
      })
    );
    installId = installRow.id;

    // 1. Module gate — read (NEVER write) the tenant's enabled modules; each gated
    //    slice below provisions only into an enabled one (provisioning invariant).
    const isOn = moduleGate(await listEnabledModules(tenantId));

    // The shared state every slice reads/writes. Slices are extracted (below) so the
    // module-backfill can re-run a single one against an existing install.
    const env: SliceEnv = {
      ctx,
      propCtx,
      tenantId,
      userId,
      propertyId,
      blueprint,
      sampleData,
      result,
      assetMap,
      asset: (id?: string) => (id ? assetMap.get(id) : undefined),
    };

    // 2–4. Unconditional slices: media, brand identity + site name/socials, theme.
    //
    // The MEDIA runs whichever way the examples went. Its images are the design's
    // own — the hero photograph, the section backgrounds — and the pages point at
    // them by id, so withholding them would leave the structure she DID ask for
    // full of holes. A few unused product photographs in her library is the far
    // smaller cost.
    await installAssetsSlice(env);
    await installBrandSlice(env);
    await installThemeSlice(env);

    // 5–10. Module-gated content slices — each installs only when its module is on.
    //       Each also reads `sampleData` for the parts of itself that are examples
    //       rather than structure (issue 098); scheduling is examples end to end.
    if (isOn('cms')) await installContentSlice(env);
    if (isOn('commerce')) await installCommerceSlice(env);
    if (isOn('scheduling')) await installSchedulingSlice(env);
    if (isOn('builder')) await installSiteSlice(env);
    if (isOn('email')) await installEmailSlice(env);

    result.counts = {
      assets: blueprint.assets.length,
      content: result.content.length,
      categories: Object.keys(result.categories).length,
      collections: Object.keys(result.collections).length,
      products: result.products.length,
      pages: result.pages.length,
      emails: result.emails.length,
      sequences: result.sequences.length,
      schedulingServices: result.scheduling?.services.length ?? 0,
      schedulingResources: Object.keys(result.scheduling?.resources ?? {}).length,
    };

    // 10b. Baseline capture (docs/55 §4) — record the per-artifact merge ANCESTOR so
    //      a later blueprint update can reconcile non-destructively (tell a tenant
    //      edit from a blueprint change). One row per artifact in
    //      tenant_blueprint_install_artifacts, holding the stamped content for this
    //      version. Without this, an update could only two-way-merge and would
    //      false-conflict on every edit.
    await captureBaselines(
      ctx,
      installRow.id,
      blueprint.version,
      resolveBlueprintArtifacts(blueprint, result, assetMap, { sampleData })
    );

    // 11. Finalize the install row → `installed`, with the full id-map. Use
    //     installRow.id (definitely set here) so the closure sees a non-null id.
    await withTenant(ctx, (tx) =>
      tx.tenantBlueprintInstall.update({
        where: { id: installRow.id },
        data: { status: 'installed', result: result as unknown as Prisma.InputJsonValue },
      })
    );

    await publish(logger, 'template.installed', tenantId, userId, {
      installId: installRow.id,
      blueprintKey: blueprint.key,
      propertyId,
      counts: result.counts,
    });

    logger.info(
      { tenantId, propertyId, blueprint: blueprint.key, counts: result.counts },
      'blueprint installed'
    );
    return { installId: installRow.id, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, tenantId, blueprint: blueprint.key }, 'blueprint install failed');
    // Persist `failed` + the partial id-map so the dashboard offers Reset & retry and
    // the reset deletes exactly what was created before the failure (D8).
    if (installId) {
      const failedId = installId;
      await withTenant(ctx, (tx) =>
        tx.tenantBlueprintInstall.update({
          where: { id: failedId },
          data: {
            status: 'failed',
            error: message,
            result: result as unknown as Prisma.InputJsonValue,
          },
        })
      ).catch(() => undefined);
    }
    await publish(logger, 'template.install_failed', tenantId, userId, {
      installId,
      blueprintKey: blueprint.key,
      propertyId,
      error: message,
    }).catch(() => undefined);
    throw err;
  }
}

/** Shared state threaded through the install SLICE helpers below. `installBlueprint`
 *  builds one and runs the slices in order; the module-backfill (blueprint-backfill.ts)
 *  builds one from a stored install and runs a single module's slice against it. The
 *  field names match the locals the slice bodies use, so each slice is the original
 *  install block verbatim. */
export interface SliceEnv {
  ctx: { tenantId: string; userId: string | undefined };
  propCtx: { tenantId: string; userId: string | undefined; propertyId: string };
  tenantId: string;
  userId: string | null;
  propertyId: string;
  blueprint: Blueprint;
  /** Whether this install brings the design's examples (issue 098). Threaded here
   *  rather than read per slice, so the backfill running a slice on its own gets
   *  the SAME answer the original install was given. */
  sampleData: boolean;
  result: InstallResult;
  assetMap: Map<string, string>;
  asset: (id?: string) => string | undefined;
}

/** 2. Assets → MediaAsset rows — always runs (media is tenant identity, not a module). */
export async function installAssetsSlice(env: SliceEnv): Promise<void> {
  const { tenantId, blueprint, result, assetMap, ctx } = env;

  // 2. Assets → MediaAsset rows (one tx). Hot-linked: key holds the absolute
  //    URL; mediaPublicUrl() passes it through (docs/54 §6). Idempotent: an asset
  //    whose key already exists for this tenant is reused, so a reinstall doesn't
  //    pile up duplicate media rows (reconcile, never destroy-and-recreate).
  if (blueprint.assets.length > 0) {
    await withTenant(ctx, async (tx) => {
      for (const a of blueprint.assets) {
        const existing = await tx.mediaAsset.findFirst({
          where: { tenantId, key: a.url },
          select: { id: true },
        });
        const row =
          existing ??
          (await tx.mediaAsset.create({
            data: {
              tenantId,
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
          }));
        assetMap.set(a.id, row.id);
        result.assets[a.id] = row.id;
      }
    });
  }
}

/** 3. Brand identity + 3b site name/socials — always runs (tenant identity + look). */
export async function installBrandSlice(env: SliceEnv): Promise<void> {
  const { ctx, propertyId, blueprint, asset } = env;

  // Is the target the tenant's PRIMARY site? The brand step scopes on this
  // (docs/49 §3): the primary writes the tenant-wide brand; a SECONDARY site
  // writes its own per-property `brand_override`, so installing onto one site
  // never rebrands its siblings.
  const prop = await withTenant(ctx, (tx) =>
    tx.property.findUnique({
      where: { id: propertyId },
      select: { name: true, settings: true, brandOverride: true },
    })
  );

  // 3. Brand identity — onto the TARGET SITE's own `brand_override`, whether or
  // not it is the primary. Installing the primary's brand into TenantBrand (the
  // default every unbranded site inherits) is what made a blueprint install on one
  // site restyle its siblings; the base is left alone so it stays a neutral
  // fallback. The full identity set is carried — the old secondary-site branch
  // wrote only businessName + two colors + the light logo, silently dropping the
  // fonts, the dark logo and the favicon, so a non-primary install inherited the
  // tenant's type stack instead of the blueprint's.
  //
  // A template gives you a LOOK. The NAME and the WORDS are the merchant's (issue
  // 210). Two things are deliberately not carried from the blueprint:
  //
  //  · `businessName` — deprecated for naming (see db/scripts/backfill-property-name.ts,
  //    which exists to STRIP this key). Writing it back on every install undid that
  //    migration, and the marketplace preferred the dead key over the live name — so
  //    Thistle & Rye was listed to the public as "Kettle & Crumb". Naming is
  //    `Property.name`, handled at 3b below with the care this never had.
  //  · `tagline` — the sample business's slogan is a false statement about the
  //    installing one. Blank renders as nothing; "Seasonal food for occasions that
  //    matter" on a clothing shop renders as a lie.
  //
  // And the write MERGES rather than replaces, so a re-install cannot wipe a tagline
  // the merchant wrote.
  const b = blueprint.brand;
  const prev =
    prop?.brandOverride &&
    typeof prop.brandOverride === 'object' &&
    !Array.isArray(prop.brandOverride)
      ? (prop.brandOverride as Record<string, string>)
      : {};
  const override: Record<string, string> = {
    ...prev,
    colorPrimary: b.colors.primary,
    fontHeading: b.fonts.heading,
    fontBody: b.fonts.body,
  };
  if (b.colors.primaryForeground) override.colorPrimaryForeground = b.colors.primaryForeground;
  if (b.colors.accent) override.colorAccent = b.colors.accent;
  if (b.colors.accentForeground) override.colorAccentForeground = b.colors.accentForeground;
  if (b.colors.secondary) override.colorSecondary = b.colors.secondary;
  if (b.colors.secondaryForeground)
    override.colorSecondaryForeground = b.colors.secondaryForeground;
  const logoLight = asset(b.logoLightAssetId);
  const logoDark = asset(b.logoDarkAssetId);
  const favicon = asset(b.faviconAssetId);
  if (logoLight) override.logoLightMediaId = logoLight;
  if (logoDark) override.logoDarkMediaId = logoDark;
  if (favicon) override.faviconMediaId = favicon;
  await withTenant(ctx, (tx) =>
    tx.property.update({
      where: { id: propertyId },
      data: { brandOverride: override },
    })
  );

  // 3b. Site name + social links on the TARGET property (docs/49). The customer-
  // facing site name is Property.name (storefront chrome/title/OG read it), seeded
  // from the tenant name at provisioning — so brand it from the blueprint ONLY when
  // it's still the seed placeholder 'Default'/empty, never clobbering a name the
  // merchant already chose (mirrors db:backfill:property-name). Seed the per-site
  // social links the footer's SocialLinks renders, but only when the site has none
  // (placeholder handles the tenant swaps post-install, like the placeholder imagery).
  {
    const update: Prisma.PropertyUpdateInput = {};
    const currentName = (prop?.name ?? '').trim();
    if (currentName === '' || currentName === 'Default') update.name = b.businessName;

    const seedSocials = b.socials ?? [];
    const settings =
      prop?.settings && typeof prop.settings === 'object' && !Array.isArray(prop.settings)
        ? (prop.settings as Record<string, unknown>)
        : {};
    const existingSocials = (settings as { socials?: unknown }).socials;
    const hasSocials = Array.isArray(existingSocials) && existingSocials.length > 0;
    if (seedSocials.length > 0 && !hasSocials) {
      update.settings = { ...settings, socials: seedSocials };
    }

    if (Object.keys(update).length > 0) {
      await withTenant(ctx, (tx) =>
        tx.property.update({ where: { id: propertyId }, data: update })
      );
    }
  }
}

/** 4. Theme — REUSE-or-create the shipped SiteTheme, apply it, and apply its look.
 *
 *  RECONCILE BY NATURAL KEY, like every other slice (marketplace-catalog/CLAUDE.md:
 *  "Install is reconcile-by-natural-key (idempotent + additive)"). This one created
 *  blindly, and `sitebuilder_themes` is UNIQUE on `(tenant_id, name)` while the saved
 *  theme LIBRARY is deliberately tenant-wide — so the second site to install a given
 *  design hit the constraint and the whole install failed and rolled back.
 *
 *  That made "add this design to more than one site" impossible, which is exactly what
 *  the install dialog offers. Worst for the GOLDEN `sparx` bundle: every tenant is
 *  provisioned with it, so its theme name is always taken and it could never be added
 *  to a second site at all.
 *
 *  Reusing is the correct resolution rather than a rename: the library is tenant-wide
 *  BY DESIGN (one entry per look), and what is per-site is the APPLICATION of it —
 *  `apply()` below writes the target site's own draft config and brand scope. */
export async function installThemeSlice(env: SliceEnv): Promise<void> {
  const { ctx, propCtx, blueprint, result } = env;

  const existing = (await savedThemeService.list(ctx)).find((t) => t.name === blueprint.theme.name);
  const theme =
    existing ??
    (await savedThemeService.create(ctx, {
      name: blueprint.theme.name,
      basePresetKey: blueprint.theme.basePresetKey,
      presentation: blueprint.theme.presentation ?? {},
      ...(blueprint.theme.brand ? { brand: blueprint.theme.brand } : {}),
    }));
  // Only a theme this install MINTED is recorded on the result, because uninstall
  // deletes what it records (`savedThemeService.remove`). Removing a library entry a
  // sibling site is still wearing would strip that site's look.
  if (!existing) result.theme = { id: theme.id, name: theme.name };
  if (blueprint.theme.apply) {
    // apply writes the target site's draft config AND applies the theme's captured
    // brand to the right scope (primary → tenant base brand, non-primary → the
    // site's override), so no separate brand write is needed here (docs/49 Phase 6).
    await savedThemeService.apply(propCtx, theme.id);
  }
}

/** 5. Content entries (+ 5a authors/taxonomy) — CMS module only (caller gates). */
export async function installContentSlice(env: SliceEnv): Promise<void> {
  const { ctx, tenantId, userId, propertyId, blueprint, result, asset, assetMap } = env;

  // 5. Content entries (draft) — CMS module only; a non-CMS tenant gets none.

  // Every row this slice writes is an EXAMPLE (issue 098): the articles, the
  // bylines that wrote them, the categories and tags they were filed under. The
  // content TYPES are the structure here, and a blueprint does not install those
  // — `resolveType` reads what the tenant already has — so declining the examples
  // costs nothing structural. Her Content list is simply empty, which is the
  // truth about a publication that has not published yet.
  if (!env.sampleData) return;

  // 5a. Byline personas + taxonomy the entries reference (docs/131 §4). Seeded ONCE,
  //     before the entries, so each entry can link its author + terms by the slug it
  //     names. Reconciled by natural key so a reinstall reuses rather than duplicates.
  //     Only runs when the CMS module is on AND something actually references a byline.
  //
  //     RECONCILE ON THE KEY THE DATABASE ACTUALLY ENFORCES. These three used to be
  //     looked up per SITE — `(tenant, property, slug)` — while the unique indexes are
  //     `authors (tenant_id, slug)`, `taxonomies (tenant_id, key)` and
  //     `taxonomy_terms (taxonomy_id, slug)`. A lookup narrower than its constraint
  //     finds nothing and then asks for a row the database refuses, so adding the same
  //     design to a SECOND site of the same business died on
  //     "Unique constraint failed" partway through — with the site already created and
  //     the install row left `failed`. The pane above it says "You can add it to more
  //     than one", which is what a person then tries.
  //
  //     An author is a PERSON and a taxonomy is a vocabulary; both belong to the
  //     business rather than to one of its websites, which is what those indexes have
  //     always said. `propertyId` is still stamped on a row this install creates, so
  //     whichever site introduced one owns it; a row that already exists is reused as
  //     it stands and never repointed, because another site's content may reference it.
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const authorIdBySlug = new Map<string, string>();
  // termId keyed by `${taxonomyKey} ${termSlug}` — the two vocabularies share a
  // slug space only within their own key, so the key is part of the map key.
  const termIdByKey = new Map<string, string>();
  const usesByline =
    blueprint.authors.length > 0 ||
    blueprint.content.some((e) => Boolean(e.categories?.length) || Boolean(e.tags?.length));
  if (usesByline) {
    await withTenant(ctx, async (tx) => {
      // Authors — reconcile by (site, slug).
      for (const a of blueprint.authors) {
        const existing = await tx.author.findFirst({
          where: { tenantId, slug: a.slug },
          select: { id: true },
        });
        const id =
          existing?.id ??
          (
            await tx.author.create({
              data: {
                tenantId,
                propertyId,
                slug: a.slug,
                displayName: a.displayName,
                bio: a.bio ?? null,
                avatarAssetId: asset(a.avatarAssetId) ?? null,
              },
              select: { id: true },
            })
          ).id;
        authorIdBySlug.set(a.slug, id);
      }

      // Taxonomy — created lazily, only the standard two (categories → `blog_category`,
      // tags → `blog_tag`), the keys the storefront byline projection splits on.
      const taxonomyIdByKey = new Map<string, string>();
      const ensureTaxonomy = async (
        key: string,
        name: string,
        pluralName: string
      ): Promise<string> => {
        const cached = taxonomyIdByKey.get(key);
        if (cached) return cached;
        const existing = await tx.taxonomy.findFirst({
          where: { tenantId, key },
          select: { id: true },
        });
        const id =
          existing?.id ??
          (
            await tx.taxonomy.create({
              data: { tenantId, propertyId, key, name, pluralName },
              select: { id: true },
            })
          ).id;
        taxonomyIdByKey.set(key, id);
        return id;
      };
      const ensureTerm = async (
        key: string,
        taxName: string,
        taxPlural: string,
        name: string
      ): Promise<void> => {
        const slug = slugify(name);
        if (!slug) return;
        const cacheKey = `${key} ${slug}`;
        if (termIdByKey.has(cacheKey)) return;
        const taxonomyId = await ensureTaxonomy(key, taxName, taxPlural);
        const existing = await tx.taxonomyTerm.findFirst({
          where: { tenantId, taxonomyId, slug },
          select: { id: true },
        });
        const id =
          existing?.id ??
          (
            await tx.taxonomyTerm.create({
              data: { tenantId, propertyId, taxonomyId, slug, name },
              select: { id: true },
            })
          ).id;
        termIdByKey.set(cacheKey, id);
      };
      for (const e of blueprint.content) {
        for (const c of e.categories ?? [])
          await ensureTerm('blog_category', 'Category', 'Categories', c);
        for (const t of e.tags ?? []) await ensureTerm('blog_tag', 'Tag', 'Tags', t);
      }
    });
  }

  for (const entry of blueprint.content) {
    await withTenant(ctx, async (tx) => {
      const type = await resolveType(tx, entry.typeKey);
      const schema = parseTypeSchema(type);
      const rawBody = resolveAssetRefs(entry.body, assetMap) as Record<string, unknown>;
      const body = validateAndNormalizeBody(schema, rawBody);
      const seo: Record<string, unknown> = {};
      if (entry.seo?.title) seo.title = entry.seo.title;
      if (entry.seo?.description) seo.description = entry.seo.description;
      if (entry.seo?.canonical) seo.canonical = entry.seo.canonical;
      if (entry.seo?.robots) seo.robots = entry.seo.robots;
      const ogId = asset(entry.seo?.ogImageAssetId);
      if (ogId) seo.ogImage = ogId;
      // RECONCILE BY NATURAL KEY, like the products/categories/authors slices.
      // `content_entries` is UNIQUE on `(tenant_id, type_key, slug)` and an entry is
      // TENANT-wide with per-site scoping through the junction below — so creating
      // blindly meant the second site to install a given design collided on the first
      // site's entries and the whole install failed and rolled back.
      //
      // Only matched on a real slug: Postgres treats NULLs as distinct, so slugless
      // entries never collide and each install genuinely wants its own.
      const existingEntry = entry.slug
        ? await tx.contentEntry.findFirst({
            where: { tenantId, typeKey: entry.typeKey, slug: entry.slug },
            select: { id: true },
          })
        : null;
      const row =
        existingEntry ??
        (await tx.contentEntry.create({
          data: {
            tenantId,
            typeKey: entry.typeKey,
            slug: entry.slug ?? null,
            // DRAFT, like every other artifact this installer creates, and unlike what
            // this line used to do (issue 377). Every content entry in every blueprint
            // in the marketplace declares `published`, and honoring that put somebody
            // else's example articles onto the PUBLIC site the moment a design was
            // added -- an entry is scoped to the target site through the junction
            // below, and a site with a live journal page lists its published entries
            // whether or not the design's own pages have been published yet. The screen
            // says three separate times that nothing goes live until you publish it.
            //
            // `goLiveInstall` is what publishes them, on the tenant's explicit go-live,
            // which is the contract stated at the top of this file and the one the
            // pages, products and emails have always followed.
            status: 'draft',
            body: body as Prisma.InputJsonValue,
            seoJson: seo as Prisma.InputJsonValue,
            // `author_id` FKs to the CMS `authors` table, NOT `users`. The blueprint now
            // models a byline (`entry.authorSlug` → an `Author` seeded in 5a); an entry
            // that names no author, or names one the blueprint didn't ship, stays null.
            // (recordRevision's authorId below is a plain audit field, not FK-bound, so
            // the installing user is fine to record there.)
            authorId: entry.authorSlug ? (authorIdBySlug.get(entry.authorSlug) ?? null) : null,
          },
        }));
      // Scope to the installed site so content doesn't bleed into other sites. The
      // junction's PK is (property_id, entry_id), so re-asserting an existing link is a
      // no-op rather than a duplicate — which is what makes reinstalling onto the SAME
      // site idempotent too.
      await tx.contentEntryProperty.createMany({
        data: [{ entryId: row.id, propertyId }],
        skipDuplicates: true,
      });
      // Link the entry's categories + tags to the terms seeded in 5a. Idempotent — the
      // link's PK is (entryId, termId), so a reinstall re-asserts rather than duplicates.
      // Key format MUST match `ensureTerm`'s cache key `${taxonomyKey} ${slug}` — the
      // cache used to key on a NUL separator while this looked up with a space, so the
      // lookup below always missed and category/tag links were NEVER created. Both use a
      // plain space now (slugs contain none, and the two prefixes differ, so it's exact).
      const entryTermKeys = [
        ...(entry.categories ?? []).map((c) => `blog_category ${slugify(c)}`),
        ...(entry.tags ?? []).map((t) => `blog_tag ${slugify(t)}`),
      ];
      for (const key of entryTermKeys) {
        const termId = termIdByKey.get(key);
        if (!termId) continue;
        await tx.entryTaxonomyTerm.upsert({
          where: { entryId_termId: { entryId: row.id, termId } },
          create: { entryId: row.id, termId, tenantId },
          update: {},
        });
      }
      // Only for an entry this install actually WROTE. A reused entry's body is the
      // tenant's own — possibly edited since the sibling site installed it — so
      // re-syncing references against the blueprint's body would be wrong, and stamping
      // an "Installed from template" revision would claim a change that never happened.
      if (!existingEntry) {
        await syncReferences(tx, tenantId, row.id, schema, body);
        await recordRevision(tx, {
          tenantId,
          entryId: row.id,
          body,
          seoJson: seo,
          // What was WRITTEN, not what the manifest asked for. A revision is the
          // history of the row, and a first revision claiming `published` on a row
          // that is a draft would misread as somebody having unpublished it.
          status: 'draft',
          kind: 'manual',
          authorId: userId ?? null,
          summary: 'Installed from template',
        });
      }
      result.content.push({
        typeKey: entry.typeKey,
        slug: entry.slug ?? null,
        id: row.id,
        // What the design MEANT this entry to be once the site is live. Everything is
        // installed as a draft; this is the only record of the difference between an
        // entry the design ships live and one it ships as a draft, and `goLiveInstall`
        // is its only reader.
        declaredStatus: entry.status,
        ...(existingEntry ? { reused: true } : {}),
      });
    });
  }
}

/** 6. Commerce catalog — Commerce module only (caller gates). */
export async function installCommerceSlice(env: SliceEnv): Promise<void> {
  const { ctx, propertyId, blueprint, result, asset } = env;

  // 6. Commerce — catalog only when the Commerce module is on (else skipped).
  const commerce = blueprint.commerce;
  if (!commerce) return;
  // Reconcile by natural key (see the helpers above): reuse/restore-then-create,
  // never destroy-and-recreate. Existing rows are left alone.

  // 6a. Categories — parent-first (resolve parentHandle as we go).
  const catMap = new Map<string, string>();
  const pending = [...commerce.categories];
  let guard = pending.length + 1;
  while (pending.length > 0 && guard-- > 0) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const c = pending[i]!;
      if (c.parentHandle && !catMap.has(c.parentHandle)) continue; // wait for parent
      let id = await reuseOrRestoreCategory(ctx, c.handle);
      if (id) {
        await widenScopeIfScoped(ctx, propertyId, 'category', id);
      } else {
        const created = await categoryService.create(ctx, {
          name: c.name,
          handle: c.handle,
          description: c.description,
          parentId: c.parentHandle ? catMap.get(c.parentHandle) : null,
          position: c.position,
          featured: c.featured,
          iconMediaId: asset(c.iconAssetId),
          heroMediaId: asset(c.heroAssetId),
          seoTitle: c.seoTitle,
          seoDescription: c.seoDescription,
          ogImageId: asset(c.ogImageAssetId),
          // Scope to the installed site, like the products below. Omitted, this
          // defaulted to `[]` — which in Model B means "show on EVERY site", so a
          // category installed for one business appeared in a sibling business's
          // storefront navigation.
          propertyIds: [propertyId],
        });
        id = created.id;
        result.mintedCategories?.push(c.handle);
      }
      catMap.set(c.handle, id);
      result.categories[c.handle] = id;
      pending.splice(i, 1);
    }
  }

  // 6b. Collections (empty; membership set from products below).
  const collMap = new Map<string, string>();
  for (const c of commerce.collections) {
    let id = await reuseOrRestoreCollection(ctx, c.handle);
    if (id) {
      await widenScopeIfScoped(ctx, propertyId, 'collection', id);
    } else {
      const created = await collectionService.create(ctx, {
        name: c.name,
        handle: c.handle,
        description: c.description,
        type: c.type,
        ruleSet: c.ruleSet,
        heroMediaId: asset(c.heroAssetId),
        featured: c.featured,
        seoTitle: c.seoTitle,
        seoDescription: c.seoDescription,
        ogImageId: asset(c.ogImageAssetId),
        // Scope to the installed site — same reason as the categories above.
        propertyIds: [propertyId],
      });
      id = created.id;
      result.mintedCollections?.push(c.handle);
    }
    collMap.set(c.handle, id);
    result.collections[c.handle] = id;
  }

  // 6b′. Product types (docs/143) — upsert by (tenant, key) BEFORE products so a
  //      product's `attributes` bag validates against its type. A blueprint usually
  //      reuses a platform BUILT-IN key (apparel, cosmetics, …), which resolves via
  //      RLS with no install; this step exists for a blueprint that ships its OWN
  //      bespoke type. Tenant-owned (is_built_in=false) so it shadows nothing and is
  //      the tenant's to edit. Idempotent — reinstall updates the schema in place.
  for (const pt of blueprint.productTypes ?? []) {
    // Its own tenant-scoped tx (like the content block above) — this section runs
    // through commerce SERVICES with `ctx`, not a shared transaction client, so the
    // raw `product_types` upsert must open its own `withTenant` for RLS.
    await withTenant(ctx, async (tx) => {
      await tx.productType.upsert({
        where: { tenantId_key: { tenantId: ctx.tenantId, key: pt.key } },
        create: {
          tenantId: ctx.tenantId,
          key: pt.key,
          name: pt.name,
          pluralName: pt.pluralName ?? null,
          description: pt.description ?? null,
          icon: pt.icon ?? null,
          isBuiltIn: false,
          attributeSchema: pt.attributeSchema,
        },
        update: {
          name: pt.name,
          pluralName: pt.pluralName ?? null,
          description: pt.description ?? null,
          icon: pt.icon ?? null,
          attributeSchema: pt.attributeSchema,
        },
      });
    });
  }

  // The line between structure and examples runs right here (issue 098). Above it
  // are the shelves — the categories the navigation points at, the collections the
  // grids are bound to, the product types her own products will validate against.
  // Below it is somebody else's stock standing on them. An owner who declines the
  // examples gets a shop laid out and empty, which is what a shop is on its first
  // morning; the bound grids fill in as she adds her own.
  if (!env.sampleData) return;

  // Precompute each product's collections (union of its collectionHandles and
  // any collection whose productHandles names it).
  const collsForProduct = new Map<string, Set<string>>();
  for (const p of commerce.products) collsForProduct.set(p.handle, new Set(p.collectionHandles));
  for (const c of commerce.collections) {
    for (const ph of c.productHandles) collsForProduct.get(ph)?.add(c.handle);
  }

  // 6c. Products → options → variants → images.
  for (const p of commerce.products) {
    // Reconcile first: if a product with this handle already exists (live, or a
    // tombstone from a prior reset), reuse it and leave its content alone — only
    // bring back any of the blueprint's variant SKUs that are tombstoned so the
    // product is sellable. The SKU unique constraint makes reuse the ONLY way to
    // reinstall; recreating would collide. Missing variants under an already-living
    // product are intentionally not added (leave the existing product untouched).
    const reusedId = await reuseOrRestoreProduct(ctx, p.handle);
    if (reusedId) {
      const skuToVariant = new Map<string, string>();
      for (const v of p.variants) {
        const vid = await reuseOrRestoreVariant(ctx, v.sku);
        if (vid) skuToVariant.set(v.sku, vid);
      }
      // Wire the reused product into the blueprint's categories/collections + site
      // so the bound grids actually render it (additive — see linkProductRelations).
      const categoryIds = p.categoryHandles
        .map((h) => catMap.get(h))
        .filter((x): x is string => !!x);
      const collectionIds = [...(collsForProduct.get(p.handle) ?? [])]
        .map((h) => collMap.get(h))
        .filter((x): x is string => !!x);
      await linkProductRelations(ctx, reusedId, categoryIds, collectionIds, propertyId);
      // Re-link images to the CURRENT assets: a reused product's stored image rows
      // point at assets a prior reset deleted, so the storefront 404s the photo.
      const reuseImages: Parameters<typeof relinkProductImages>[2] = [];
      for (const img of p.images) {
        const mediaAssetId = asset(img.assetId);
        if (!mediaAssetId) continue;
        reuseImages.push({
          mediaAssetId,
          variantId: img.variantSku ? skuToVariant.get(img.variantSku) : undefined,
          position: img.position,
          alt: img.alt,
          isPrimary: img.isPrimary,
        });
      }
      await relinkProductImages(ctx, reusedId, reuseImages);
      result.products.push({ handle: p.handle, id: reusedId, reused: true });
      continue;
    }

    const created = await productService.create(ctx, {
      title: p.title,
      handle: p.handle,
      description: p.description,
      status: p.status,
      productType: p.productType,
      // Typed product type + attributes (docs/143). The service validates the
      // attribute bag against the resolved type (built-in or the blueprint's own,
      // installed above) — a bad bag fails the install, exactly like a bad content body.
      productTypeKey: p.productTypeKey,
      attributes: p.attributes,
      vendor: p.vendor,
      tags: p.tags,
      fulfillmentType: p.fulfillmentType,
      weight: p.weight,
      dimensions: p.dimensions,
      taxClass: p.taxClass,
      requiresShipping: p.requiresShipping,
      categoryIds: p.categoryHandles.map((h) => catMap.get(h)).filter((x): x is string => !!x),
      collectionIds: [...(collsForProduct.get(p.handle) ?? [])]
        .map((h) => collMap.get(h))
        .filter((x): x is string => !!x),
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      ogImageId: asset(p.ogImageAssetId),
      // Scope to the installed site so it doesn't bleed into other sites.
      propertyIds: [propertyId],
    });
    result.products.push({ handle: p.handle, id: created.id });

    // Options → value id map keyed by `${name}::${value}`.
    const valueIds = new Map<string, string>();
    if (p.options.length > 0) {
      const rows = await variantService.setOptions(ctx, created.id, {
        options: p.options.map((o) => ({
          name: o.name,
          displayType: o.displayType,
          position: o.position,
          values: o.values.map((v) => ({
            value: v.value,
            swatchHex: v.swatchHex,
            swatchImageId: asset(v.swatchImageAssetId),
            position: v.position,
          })),
        })),
      });
      for (const o of rows) for (const v of o.values) valueIds.set(`${o.name}::${v.value}`, v.id);
    }

    // Variants.
    const skuToVariant = new Map<string, string>();
    for (const v of p.variants) {
      const optionValueIds = Object.entries(v.optionValues)
        .map(([name, val]) => valueIds.get(`${name}::${val}`))
        .filter((x): x is string => !!x);
      const variant = await variantService.create(ctx, created.id, {
        sku: v.sku,
        barcode: v.barcode,
        title: v.title,
        optionValueIds,
        priceCents: v.priceCents,
        compareAtPriceCents: v.compareAtPriceCents,
        costCents: v.costCents,
        currency: v.currency,
        weight: v.weight,
        dimensions: v.dimensions,
        inventoryPolicy: v.inventoryPolicy,
        requiresShipping: v.requiresShipping,
        isDefault: v.isDefault,
        position: v.position,
      });
      skuToVariant.set(v.sku, variant.id);
    }

    // Images.
    for (const img of p.images) {
      const mediaAssetId = asset(img.assetId);
      if (!mediaAssetId) continue;
      const optionValueIds = Object.entries(img.optionValues)
        .map(([name, val]) => valueIds.get(`${name}::${val}`))
        .filter((x): x is string => !!x);
      const created2 = await variantService.addImage(ctx, {
        productId: created.id,
        variantId: img.variantSku ? skuToVariant.get(img.variantSku) : undefined,
        mediaAssetId,
        position: img.position,
        alt: img.alt,
        optionValueIds,
      });
      if (img.isPrimary) await variantService.setPrimaryImage(ctx, created2.id);
    }
  }
}

/** 7. The authored silica site — frame + pages + theme + symbols. Builder module only. */
/** 7. Scheduling — a working booking flow when the Scheduling module is on (else
 *  skipped). Provisions the deposit/cancellation policies, the bookable resources
 *  (staff/rooms/stations) with their weekly hours, and the service menu — the spine
 *  the storefront `/book` widget renders live. Reconcile by natural key (NAME):
 *  reuse an existing policy/resource/service, create only the genuinely-absent, and
 *  set a resource's weekly windows ONLY on fresh create (setAvailabilityWindows is
 *  replace-all, so a reinstall must never clobber a tenant's edited hours). Services
 *  scope to the installed property; resources + services attach the
 *  activation-seeded 'Main location' (bootstrapSchedulingDefaults), reused not
 *  duplicated. Handle-based `resourceRequirements` route to resources by kind+skill
 *  at booking time (no id wiring here). */
/** The zone the tenant has said it works in, or 'UTC' when it has said nothing.
 *  Never the SERVER's zone: a machine in another region would silently stamp its
 *  own clock onto somebody else's shop. */
async function zoneOfBusiness(ctx: SliceEnv['ctx'], tenantId: string): Promise<string> {
  const business = await withTenant(ctx, (tx) =>
    tx.tenantBusiness.findUnique({ where: { tenantId }, select: { timezone: true } })
  );
  return business?.timezone ?? 'UTC';
}

export async function installSchedulingSlice(env: SliceEnv): Promise<void> {
  const { tenantId, propertyId, blueprint, result, ctx } = env;

  const sched = blueprint.scheduling;
  if (!sched) return;

  // This slice is examples end to end, and it is the one issue 098 was filed on: a
  // place called Maison Élan, three stylists named Ava, Maya and Noor, and seven
  // treatments priced for a salon in another country, all created 0.4 seconds
  // after the account existed. There is no structural half to keep — a booking
  // policy with no service to govern is a row with nothing behind it — so the
  // whole slice stands down. Bookings then opens on her own 'Main location' and
  // nothing else, which is exactly what a business that has not written its menu
  // yet has.
  if (!env.sampleData) return;

  const idmap = result.scheduling ?? { locations: {}, policies: {}, resources: {}, services: [] };
  result.scheduling = idmap;

  // A resource/service image is a hot-linked URL on the scheduling row, not a
  // MediaAsset ref — resolve the manifest asset id to its declared http(s) URL
  // (skip data: URIs and anything over the column bound).
  const assetUrlById = new Map(blueprint.assets.map((a) => [a.id, a.url]));
  const imageUrlFor = (assetId?: string): string | undefined => {
    if (!assetId) return undefined;
    const url = assetUrlById.get(assetId);
    return url && /^https?:\/\//i.test(url) && url.length <= 2048 ? url : undefined;
  };

  // ── Places ────────────────────────────────────────────────────────────────
  // A design may bring its OWN premises (`scheduling.locations`), which is what
  // keeps two businesses on one tenant apart: the barber design's chairs file at
  // the barber shop, the grooming design's at the salon, each scoped to its own
  // site. A design that declares none files everything at the tenant's seeded
  // 'Main location', which is right for the ordinary single-premises business.
  //
  // Declared places are reconciled BY NAME like every other slice — a reinstall,
  // or a second site running the same design, reuses the row instead of minting a
  // duplicate the owner would have to clean up.
  //
  // `?? []` rather than trusting the schema default: `locations` is NEW, and every
  // bundle authored before it exists genuinely has no such key. A parsed blueprint
  // gets the default, but a captured or hand-assembled one need not have gone
  // through Zod — and the failure mode without this is a hard crash mid-install.
  const declaredLocations = sched.locations ?? [];

  // The clock this business runs on. A design cannot know it, so it no longer
  // guesses: an unstated zone is filled from what the tenant has recorded, and
  // 'UTC' is the answer only when the tenant has recorded nothing either.
  //
  // The old default was a plain 'UTC' on every place and every person, which is
  // not a neutral value but a claim — and it is the claim the whole availability
  // engine reads weekly hours through, so a salon's 9am chair opened at 2am and
  // its own website offered the middle of the night (issue 151).
  const tenantZone = await zoneOfBusiness(ctx, tenantId);

  const locationIds = new Map<string, string>();
  for (const l of declaredLocations) {
    const existing = await withTenant(ctx, (tx) =>
      tx.businessLocation.findFirst({ where: { tenantId, name: l.name }, select: { id: true } })
    );
    if (existing) {
      locationIds.set(l.handle, existing.id);
      // Reused: widen onto this site only if it is ALREADY scoped. A place with no
      // links serves every site, and adding the first link would withdraw it from
      // every sibling — the never-narrow rule.
      const reusedId = existing.id;
      await withTenant(ctx, async (tx) => {
        const links = await tx.businessLocationProperty.count({
          where: { locationId: reusedId },
        });
        if (links === 0) return;
        await tx.businessLocationProperty.createMany({
          data: [{ locationId: reusedId, propertyId }],
          skipDuplicates: true,
        });
      });
      continue;
    }
    // Minted: scoped to the site being installed, so a sibling business's diary
    // never offers this place. NO ADDRESS — the blueprint cannot know where the
    // business is, and an invented one reads as real (the contact-spine rule).
    const created = await createLocation(tenantId, {
      name: l.name,
      timezone: l.timezone ?? tenantZone,
      propertyIds: [propertyId],
    });
    locationIds.set(l.handle, created.id);
  }
  idmap.locations = Object.fromEntries(locationIds);

  // The default place for anything that names none: the design's FIRST declared
  // location, else the activation-seeded 'Main location'. Null-safe — an install
  // that somehow precedes the seed just leaves location unset.
  const seededLocationId =
    declaredLocations.length > 0
      ? null
      : await withTenant(ctx, (tx) =>
          tx.businessLocation.findFirst({
            where: { tenantId, name: 'Main location' },
            select: { id: true },
          })
        ).then((l) => l?.id ?? null);

  const firstDeclared = declaredLocations[0]
    ? (locationIds.get(declaredLocations[0].handle) ?? null)
    : null;
  const defaultLocationId = firstDeclared ?? seededLocationId;

  /** Where a resource or service belongs. A named handle wins; the validator has
   *  already refused an unknown one, so a miss here can only be a missing name. */
  const locationFor = (handle?: string): string | null =>
    handle ? (locationIds.get(handle) ?? defaultLocationId) : defaultLocationId;

  // The seeded place is widened onto this site under the same never-narrow rule,
  // so a tenant who has deliberately split their premises keeps them split.
  if (seededLocationId) {
    const seeded = seededLocationId;
    await withTenant(ctx, async (tx) => {
      const links = await tx.businessLocationProperty.count({ where: { locationId: seeded } });
      if (links === 0) return;
      await tx.businessLocationProperty.createMany({
        data: [{ locationId: seeded, propertyId }],
        skipDuplicates: true,
      });
    });
  }

  // Policies — reconcile by name; attach seeded ones stay untouched.
  const policyIds = new Map<string, string>();
  for (const p of sched.policies) {
    const existing = await withTenant(ctx, (tx) =>
      tx.bookingPolicy.findFirst({ where: { tenantId, name: p.name }, select: { id: true } })
    );
    let id = existing?.id ?? null;
    if (!id) {
      const created = await createBookingPolicy(
        tenantId,
        CreateBookingPolicyInput.parse({
          name: p.name,
          depositType: p.depositType,
          depositAmountCents: p.depositAmountCents ?? null,
          depositPercent: p.depositPercent ?? null,
          cancellationWindowHours: p.cancellationWindowHours,
          policyText: p.policyText ?? null,
          reminderOffsetsMin: p.reminderOffsetsMin,
        })
      );
      id = created.id;
    }
    policyIds.set(p.handle, id);
    idmap.policies[p.handle] = id;
  }

  // Resources — reconcile by name; set weekly windows only on fresh create.
  for (const r of sched.resources) {
    const existing = await withTenant(ctx, (tx) =>
      tx.schedulingResource.findFirst({ where: { tenantId, name: r.name }, select: { id: true } })
    );
    let id = existing?.id ?? null;
    if (!id) {
      const created = await createResource(
        tenantId,
        CreateResourceInput.parse({
          kind: r.kind,
          name: r.name,
          timezone: r.timezone ?? tenantZone,
          capacity: r.capacity,
          capacityMin: r.capacityMin ?? null,
          capacityMax: r.capacityMax ?? null,
          skillTags: r.skillTags,
          bookableOnline: r.bookableOnline,
          locationId: locationFor(r.locationHandle),
          imageUrl: imageUrlFor(r.imageAssetId) ?? null,
          // The chairs, rooms and staff a design installs belong to the business on
          // THIS site. Left unscoped they would be allocatable by a booking taken on
          // a sibling site — one business's barber assigned to the other's grooming
          // appointment. Same rule as the categories and products above.
          propertyIds: [propertyId],
        })
      );
      id = created.id;
      if (r.windows.length > 0) {
        await setAvailabilityWindows(tenantId, {
          resourceId: id,
          windows: r.windows.map((w) => ({
            dayOfWeek: w.dayOfWeek,
            startMinute: w.startMinute,
            endMinute: w.endMinute,
          })),
        });
      }
    } else {
      // Reused by name — the tenant already has this resource. Widen it onto this site
      // only if it is ALREADY scoped; a resource with no links works everywhere, and
      // adding the first link would withdraw it from every other site at once.
      const resourceId = id;
      await withTenant(ctx, async (tx) => {
        const links = await tx.schedulingResourceProperty.count({ where: { resourceId } });
        if (links === 0) return;
        await tx.schedulingResourceProperty.createMany({
          data: [{ resourceId, propertyId }],
          skipDuplicates: true,
        });
      });
    }
    idmap.resources[r.handle] = id;
  }

  // Services — reconcile by name; attach policy + location; scope to the property.
  for (const s of sched.services) {
    const existing = await withTenant(ctx, (tx) =>
      tx.schedulingService.findFirst({ where: { tenantId, name: s.name }, select: { id: true } })
    );
    let id = existing?.id ?? null;
    if (!id) {
      const created = await createService(
        tenantId,
        CreateServiceInput.parse({
          propertyId,
          name: s.name,
          description: s.description ?? null,
          bookingType: s.bookingType,
          durationMinutes: s.durationMinutes,
          bufferBeforeMin: s.bufferBeforeMin,
          bufferAfterMin: s.bufferAfterMin,
          priceCents: s.priceCents,
          currency: s.currency,
          capacity: s.capacity,
          assignmentStrategy: s.assignmentStrategy,
          resourceRequirements: s.resourceRequirements,
          policyId: s.policyHandle ? (policyIds.get(s.policyHandle) ?? null) : null,
          locationId: locationFor(s.locationHandle),
          minLeadMinutes: s.minLeadMinutes,
          maxAdvanceDays: s.maxAdvanceDays,
          slotIntervalMin: s.slotIntervalMin,
          bookableOnline: s.bookableOnline,
          requiresApproval: s.requiresApproval,
          imageUrl: imageUrlFor(s.imageAssetId) ?? null,
        })
      );
      id = created.id;
    }
    idmap.services.push({ handle: s.handle, id });
  }
}

export async function installSiteSlice(env: SliceEnv): Promise<void> {
  const { propCtx, blueprint, result } = env;

  // 7. The authored silica site — frame + pages + theme + symbols, in ONE write.
  //    Builder module only (a headless tenant gets no hosted site).
  //
  //    This replaces the old three-step legacy dance (create components, create a
  //    layout, create pages one by one, then convert the whole lot to silica at
  //    go-live through a best-effort bridge). The manifest already holds exactly
  //    what the store wants, so it goes straight in through the same seam a human
  //    author's save uses. Nothing is converted, so nothing is lost in conversion.
  if (!blueprint.site) return;
  const site = blueprint.site;
  const installed = await siteService.installSite(propCtx, {
    pages: site.pages.map((pg) => ({
      name: pg.name,
      slug: pg.slug ?? '',
      root: resolveBindingHandles(pg.root, result),
      kind: pg.kind,
      recordType: pg.recordType ?? null,
      // The product-TYPE this page designs (docs/143 Option B) — null = default page.
      recordSubtype: pg.recordSubtype ?? null,
      isDefault: pg.isDefault,
      seoTitle: pg.seoTitle ?? null,
      seoDescription: pg.seoDescription ?? null,
      canonical: pg.canonical ?? null,
      ogImage: pg.ogImage ?? null,
      ...(pg.noindex !== undefined ? { noindex: pg.noindex } : {}),
    })),
    ...(site.frame ? { frame: { root: resolveBindingHandles(site.frame.root, result) } } : {}),
    // An omitted theme is deliberate: the tenant's own brand-derived theme then
    // stands, which is what lets one template re-skin per tenant.
    ...(site.theme ? { theme: site.theme } : {}),
    ...(site.symbols ? { symbols: site.symbols } : {}),
  });
  site.pages.forEach((pg, i) => {
    result.pages.push({
      name: pg.name,
      id: installed.pageIds[i]!,
      recordType: pg.recordType ?? null,
      recordSubtype: pg.recordSubtype ?? null,
      slug: pg.slug ?? null,
    });
  });
}

/** 10. Emails + 10a sequences — Email module only (caller gates). */
export async function installEmailSlice(env: SliceEnv): Promise<void> {
  const { ctx, propertyId, blueprint, result } = env;

  // 10. Emails (draft unless publish flagged) — Email module only.
  for (const e of blueprint.emails) {
    // The document owns subject/preheader; `syncSilica` mirrors them onto the row.
    // Unique within the tenant: the platform defaults already ship a "Welcome", so a
    // blueprint that declares one too produced two rows with the same name and no way
    // to tell them apart. Suffixed with the blueprint's name rather than a counter,
    // because the question an author is really asking is where the row came from.
    const email = await emailService.create(ctx, {
      name: await emailService.uniqueName(ctx, e.name, blueprint.name),
      subject: e.doc.subject,
      preheader: e.doc.preheader,
    });
    await emailService.syncSilica(ctx, email.id, { doc: e.doc });
    if (e.publish) await emailService.publishSilica(ctx, email.id);
    result.emails.push({ name: e.name, id: email.id });
  }

  // 10a. Email sequences (docs/81 §9) — Email module only, AFTER emails so each
  //      step can resolve its blueprint email (by name) to the just-created row id.
  //      Scoped to the install's TARGET property (same one pages/emails install
  //      under) so a sequence belongs to the site it shipped with. Created as draft
  //      unless `activate`, mirroring email publish.
  if ((blueprint.sequences ?? []).length > 0) {
    const emailIdByName = new Map(result.emails.map((e) => [e.name, e.id]));
    for (const s of blueprint.sequences) {
      const steps = s.steps.map((st, i) => {
        const builderEmailId = emailIdByName.get(st.emailName);
        if (!builderEmailId) {
          throw new Error(
            `Blueprint sequence "${s.name}" step ${String(i + 1)} references unknown email ` +
              `"${st.emailName}" (no blueprint email with that name).`
          );
        }
        return {
          id: `step-${String(i)}`,
          ...(st.name !== undefined ? { name: st.name } : {}),
          delaySeconds: st.delaySeconds,
          emailType: st.emailType,
          source: { kind: 'builder' as const, builderEmailId },
        };
      });
      const seq = await createSequence(ctx, {
        name: s.name,
        description: s.description,
        propertyId,
        reentryPolicy: s.reentryPolicy,
        exitOnPurchase: s.exitOnPurchase,
        steps,
      });
      if (s.activate) await updateSequence(ctx, seq.id, { status: 'active' });
      result.sequences.push({ name: s.name, id: seq.id });
    }
  }
}

// ── go live ─────────────────────────────────────────────────────────────────────

/** Publish everything an install created: pages, the layout (publish + activate),
 *  products (→ active), content entries (→ published), and emails. Reads the id
 *  map off the install row so it touches exactly what the template added. */
export async function goLiveInstall(ctxIn: InstallContext, installId: string): Promise<void> {
  const { tenantId, userId, propertyId, logger } = ctxIn;
  const ctx = { tenantId, userId: userId ?? undefined };
  const propCtx = { tenantId, userId: userId ?? undefined, propertyId };

  const row = await withTenant({ tenantId }, (tx) =>
    tx.tenantBlueprintInstall.findFirst({
      where: { id: installId },
      select: { id: true, result: true, status: true },
    })
  );
  if (!row) throw new Error(`Install ${installId} not found`);
  const r = row.result as unknown as InstallResult;

  // The site — ONE publish for every page, the frame, the theme, and the symbols.
  // (The old path published each page and the layout separately, then ran a bridge
  // to mirror the result into the silica columns the storefront actually reads.
  // Writing silica directly means the publish IS the thing the storefront serves.)
  if ((r.pages ?? []).length > 0) {
    await siteService
      .publish(propCtx)
      .catch((err) => logger.warn({ err, installId }, 'site publish failed'));
  }
  // Products → active.
  for (const p of r.products ?? []) {
    await productService
      .publish(ctx, p.id)
      .catch((err) => logger.warn({ err, id: p.id }, 'product publish failed'));
  }
  // Content entries → published. This is where a design's articles become public,
  // and the only place they do (issue 377): install writes them as drafts.
  for (const c of r.content ?? []) {
    // Only what the design meant to be live. An entry it ships as a draft stays one.
    // Results recorded before `declaredStatus` existed carry none, and those installs
    // did declare published for every entry, so an absent value means published.
    if (c.declaredStatus !== undefined && c.declaredStatus !== 'published') continue;
    await withTenant(ctx, async (tx) => {
      const entry = await tx.contentEntry.findFirst({
        where: { id: c.id },
        select: { body: true, seoJson: true, status: true, publishedAt: true },
      });
      if (!entry) return;
      // Only a draft. An install that REUSED an entry the shop already had must not
      // republish something they archived, and re-dating one that is already live
      // would move a real post to the top of their own journal.
      if (entry.status !== 'draft') return;
      await tx.contentEntry.update({
        where: { id: c.id },
        data: {
          status: 'published',
          publishedAt: publishTimestamp('published', entry.publishedAt),
        },
      });
      await recordRevision(tx, {
        tenantId,
        entryId: c.id,
        body: (entry.body ?? {}) as Record<string, unknown>,
        seoJson: (entry.seoJson ?? {}) as Record<string, unknown>,
        status: 'published',
        kind: 'manual',
        authorId: userId ?? null,
        summary: 'Published (go live)',
      });
    }).catch((err) => logger.warn({ err, id: c.id }, 'content publish failed'));
  }
  // Emails.
  for (const e of r.emails ?? []) {
    await emailService.publishSilica(ctx, e.id).catch(() => undefined);
  }

  // Site theme — PUBLISH the draft into a SiteVersion. Install applied the shipped
  // theme to the DRAFT only (savedThemeService.apply → sitebuilder_configs draft);
  // the storefront reads its --st-* tokens from the PUBLISHED snapshot, so without
  // this the live site keeps serving whatever was last published (a prior theme, or
  // the default) and the blueprint's theme never reaches the page. publishNow
  // snapshots the draft's themeKey + presentation and write-throughs the compiled
  // tokens, so the shipped theme goes live with the rest of the blueprint. Best-
  // effort: a theme that fails to publish shouldn't block the content go-live.
  await publishService
    .publishNow(propCtx, { note: `Blueprint go-live (${installId})` })
    .catch((err) => logger.warn({ err, installId }, 'site theme publish failed'));

  await withTenant(ctx, (tx) =>
    tx.tenantBlueprintInstall.update({
      where: { id: installId },
      data: { status: 'live', liveAt: new Date() },
    })
  );
  logger.info({ tenantId, propertyId, installId }, 'blueprint install went live');
}

// ── delete / uninstall ──────────────────────────────────────────────────────────

/** Delete / uninstall an install (docs/55 §9): remove everything it created — read
 *  from the id-map on the row — then delete the row. This is a plain UNINSTALL, not
 *  a precursor to reinstall: getting a NEW blueprint version is an Update (docs/55,
 *  non-destructive merge), never delete-then-reinstall. Best-effort per artifact (an
 *  already-removed one is skipped) and in reverse dependency order so "has
 *  descendants" / "is placed" / FK guards don't block teardown. Destructive — gated
 *  behind a confirm in the dashboard.
 *
 *  Commerce rows (products/categories/collections) SOFT-delete via the service — not
 *  a reinstall convenience but a data-integrity necessity: a SKU is tenant-unique
 *  even when soft-deleted and a cart line pins the variant (`onDelete: Restrict`), so
 *  a SKU can never be freed, only reused. (A later fresh install reconciles those
 *  tombstones by natural key — resilience, not the update path.) Pages/emails/
 *  components/theme hard delete; content hard deletes and cascades its revisions +
 *  references; the layout is deactivated then removed so a LIVE install tears down
 *  fully. The install's `tenant_blueprint_install_artifacts` baselines cascade away
 *  with the row (docs/55 §4). */
export async function deleteInstall(ctxIn: InstallContext, installId: string): Promise<void> {
  const { tenantId, userId, propertyId, logger } = ctxIn;
  const ctx = { tenantId, userId: userId ?? undefined };
  const propCtx = { tenantId, userId: userId ?? undefined, propertyId };

  const row = await withTenant({ tenantId }, (tx) =>
    tx.tenantBlueprintInstall.findFirst({
      where: { id: installId },
      select: { result: true },
    })
  );
  if (!row) throw new Error(`Install ${installId} not found`);
  const r = (row.result ?? {}) as unknown as InstallResult;

  const warn = (label: string, id: string) => (err: unknown) =>
    logger.warn({ err, id }, `uninstall: ${label} delete failed (left in place)`);

  // Reverse dependency order, so each delete's "is placed" / "has descendants" /
  // FK guard is already satisfied by the time we reach the parent.
  // Sequences before emails: a step references a blueprint email by id, so tear the
  // journey down first. deleteSequence hard-deletes a never-enrolled draft, else
  // archives (keeps the record that people were emailed) — best-effort like the rest.
  for (const s of r.sequences ?? []) await deleteSequence(ctx, s.id).catch(warn('sequence', s.id));
  for (const e of r.emails ?? []) await emailService.remove(ctx, e.id).catch(warn('email', e.id));
  // The installed site's pages. `siteService` owns the silica columns, but the ROW
  // is still a BuilderPage, so removal goes through the page service exactly as
  // before — a silica-only row deletes the same way.
  for (const p of r.pages ?? []) await pageService.remove(propCtx, p.id).catch(warn('page', p.id));
  // The frame lives on the property's active layout rather than on a layout row this
  // install created, so uninstall CLEARS it rather than deleting a row: the tenant
  // keeps their layout (and any chrome they authored on top), minus the blueprint's
  // frame. Deleting the active layout outright would leave the property with no
  // chrome at all and block a clean reinstall.
  await withTenant(ctx, (tx) =>
    tx.builderLayout.updateMany({
      where: { propertyId, isActive: true },
      data: { silicaDraftTree: Prisma.DbNull, silicaPublishedTree: Prisma.DbNull },
    })
  ).catch(warn('frame clear', propertyId));
  // COMMERCE: only what this install MINTED is removed. The commerce slice reconciles
  // by natural key, so these maps also hold rows that already belonged to the tenant —
  // and removing a design from one site used to soft-delete the products and delete the
  // categories a SIBLING site was still selling from. `mintedX` absent = an install row
  // predating that distinction; see InstallResult for why assuming "minted" is safe there.
  const mintedCategories = r.mintedCategories;
  const mintedCollections = r.mintedCollections;

  for (const p of r.products ?? []) {
    if (p.reused) {
      // A product is site-SCOPED (`ProductProperty`), so the honest undo is to stop
      // showing it here, not to withdraw it from the business.
      await withTenant(ctx, (tx) =>
        tx.productProperty.deleteMany({ where: { productId: p.id, propertyId } })
      ).catch(warn('product unlink', p.id));
      continue;
    }
    await productService.softDelete(ctx, p.id).catch(warn('product', p.id));
  }
  for (const [handle, id] of Object.entries(r.collections ?? {})) {
    if (mintedCollections && !mintedCollections.includes(handle)) {
      // Reused: this install may have widened it onto this site. Stop showing it here
      // and leave the row (and every sibling site's link) alone. A no-op when the row
      // is global — there was no link to take away.
      await withTenant(ctx, (tx) =>
        tx.collectionProperty.deleteMany({ where: { collectionId: id, propertyId } })
      ).catch(warn('collection unlink', id));
      continue;
    }
    await collectionService.remove(ctx, id).catch(warn('collection', id));
  }
  // Categories leaf-first: the id-map is parent-first (insertion order), so reverse.
  for (const [handle, id] of Object.entries(r.categories ?? {}).reverse()) {
    if (mintedCategories && !mintedCategories.includes(handle)) {
      await withTenant(ctx, (tx) =>
        tx.categoryProperty.deleteMany({ where: { categoryId: id, propertyId } })
      ).catch(warn('category unlink', id));
      continue;
    }
    await categoryService.remove(ctx, id).catch(warn('category', id));
  }
  // A REUSED entry belongs to the tenant, not to this install — a sibling site that
  // installed the same design is still showing it. Unlink it from this site and leave
  // the record alone; only entries this install minted are deleted.
  for (const c of r.content ?? []) {
    if (c.reused) {
      await withTenant(ctx, (tx) =>
        tx.contentEntryProperty.deleteMany({ where: { entryId: c.id, propertyId } })
      ).catch(warn('content unlink', c.id));
      continue;
    }
    await withTenant(ctx, (tx) => tx.contentEntry.delete({ where: { id: c.id } })).catch(
      warn('content', c.id)
    );
  }
  if (r.theme) await savedThemeService.remove(ctx, r.theme.id).catch(warn('theme', r.theme.id));
  for (const id of Object.values(r.assets ?? {}))
    await withTenant(ctx, (tx) => tx.mediaAsset.delete({ where: { id } })).catch(warn('asset', id));

  await withTenant(ctx, (tx) => tx.tenantBlueprintInstall.delete({ where: { id: installId } }));
  logger.info({ tenantId, propertyId, installId }, 'blueprint install uninstalled');
}
