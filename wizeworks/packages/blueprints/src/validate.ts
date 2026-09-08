// Blueprint integrity validation (docs/54 §4). BlueprintSchema (Zod) checks each
// node in isolation; this layer checks the CROSS-REFERENCES Zod can't see —
// every handle/asset ref resolves, handles are unique, the option lattice is
// consistent, defaults are singular, and `requiresModules` covers the content
// the blueprint actually ships. The installer (Phase 2) trusts a blueprint that
// passes both, so every reference it resolves is guaranteed to exist.

import { BlueprintSchema, type Blueprint } from './manifest';
import { collectAssetRefs } from './refs';
import { BUILT_IN_CONTENT_TYPES } from '@wizeworks/cms-schemas';

export interface BlueprintIssue {
  path: string;
  message: string;
}

export class BlueprintValidationError extends Error {
  readonly issues: BlueprintIssue[];
  constructor(issues: BlueprintIssue[]) {
    super(
      `Blueprint failed validation:\n${issues.map((i) => `  • ${i.path}: ${i.message}`).join('\n')}`
    );
    this.name = 'BlueprintValidationError';
    this.issues = issues;
    Object.setPrototypeOf(this, BlueprintValidationError.prototype);
  }
}

const BUILT_IN_TYPE_KEYS = new Set(BUILT_IN_CONTENT_TYPES.map((t) => t.key));

/** Cross-reference checks over an already-Zod-valid blueprint. Returns [] when
 *  the blueprint is internally consistent. Pure. */
export function validateBlueprintIntegrity(bp: Blueprint): BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  // ── Unique ids / handles / keys ─────────────────────────────────────────────
  const assetIds = new Set<string>();
  bp.assets.forEach((a, i) => {
    if (assetIds.has(a.id)) add(`assets[${i}]`, `Duplicate asset id "${a.id}".`);
    assetIds.add(a.id);
  });
  const assetExists = (id: string): boolean => assetIds.has(id);
  const checkAsset = (path: string, id: string | undefined): void => {
    if (id && !assetExists(id)) add(path, `References unknown asset "${id}".`);
  };

  const commerce = bp.commerce ?? { categories: [], collections: [], products: [] };

  const categoryHandles = new Set<string>();
  commerce.categories.forEach((c, i) => {
    if (categoryHandles.has(c.handle))
      add(`commerce.categories[${i}]`, `Duplicate category handle "${c.handle}".`);
    categoryHandles.add(c.handle);
  });
  const collectionHandles = new Set<string>();
  commerce.collections.forEach((c, i) => {
    if (collectionHandles.has(c.handle))
      add(`commerce.collections[${i}]`, `Duplicate collection handle "${c.handle}".`);
    collectionHandles.add(c.handle);
  });
  const productHandles = new Set<string>();
  commerce.products.forEach((p, i) => {
    if (productHandles.has(p.handle))
      add(`commerce.products[${i}]`, `Duplicate product handle "${p.handle}".`);
    productHandles.add(p.handle);
  });

  // ── Brand asset refs ────────────────────────────────────────────────────────
  checkAsset('brand.logoLightAssetId', bp.brand.logoLightAssetId);
  checkAsset('brand.logoDarkAssetId', bp.brand.logoDarkAssetId);
  checkAsset('brand.faviconAssetId', bp.brand.faviconAssetId);

  // ── Categories ──────────────────────────────────────────────────────────────
  commerce.categories.forEach((c, i) => {
    checkAsset(`commerce.categories[${i}].iconAssetId`, c.iconAssetId);
    checkAsset(`commerce.categories[${i}].heroAssetId`, c.heroAssetId);
    checkAsset(`commerce.categories[${i}].ogImageAssetId`, c.ogImageAssetId);
    if (c.parentHandle === c.handle)
      add(
        `commerce.categories[${i}].parentHandle`,
        `Category "${c.handle}" can't be its own parent.`
      );
    else if (c.parentHandle && !categoryHandles.has(c.parentHandle))
      add(`commerce.categories[${i}].parentHandle`, `Unknown parent category "${c.parentHandle}".`);
  });

  // ── Collections ─────────────────────────────────────────────────────────────
  commerce.collections.forEach((c, i) => {
    checkAsset(`commerce.collections[${i}].heroAssetId`, c.heroAssetId);
    checkAsset(`commerce.collections[${i}].ogImageAssetId`, c.ogImageAssetId);
    if (c.type === 'rules' && !c.ruleSet)
      add(`commerce.collections[${i}]`, `Rules collection "${c.handle}" needs a ruleSet.`);
    if (c.type === 'manual' && c.ruleSet)
      add(
        `commerce.collections[${i}]`,
        `Manual collection "${c.handle}" must not carry a ruleSet.`
      );
    c.productHandles.forEach((h, j) => {
      if (!productHandles.has(h))
        add(`commerce.collections[${i}].productHandles[${j}]`, `Unknown product "${h}".`);
    });
  });

  // ── Products (+ option lattice, variants, images) ───────────────────────────
  commerce.products.forEach((p, i) => {
    checkAsset(`commerce.products[${i}].ogImageAssetId`, p.ogImageAssetId);
    p.categoryHandles.forEach((h, j) => {
      if (!categoryHandles.has(h))
        add(`commerce.products[${i}].categoryHandles[${j}]`, `Unknown category "${h}".`);
    });
    p.collectionHandles.forEach((h, j) => {
      if (!collectionHandles.has(h))
        add(`commerce.products[${i}].collectionHandles[${j}]`, `Unknown collection "${h}".`);
    });

    // option name → set of declared values
    const optionValues = new Map<string, Set<string>>();
    p.options.forEach((o, j) => {
      if (optionValues.has(o.name))
        add(`commerce.products[${i}].options[${j}]`, `Duplicate option name "${o.name}".`);
      const values = new Set<string>();
      o.values.forEach((v, k) => {
        if (values.has(v.value))
          add(
            `commerce.products[${i}].options[${j}].values[${k}]`,
            `Duplicate value "${v.value}".`
          );
        values.add(v.value);
        checkAsset(
          `commerce.products[${i}].options[${j}].values[${k}].swatchImageAssetId`,
          v.swatchImageAssetId
        );
      });
      optionValues.set(o.name, values);
    });

    const checkOptionMap = (path: string, ov: Record<string, string>): void => {
      for (const [name, value] of Object.entries(ov)) {
        const vals = optionValues.get(name);
        if (!vals) add(path, `References undeclared option "${name}".`);
        else if (!vals.has(value)) add(path, `Option "${name}" has no value "${value}".`);
      }
    };

    const skus = new Set<string>();
    let defaultCount = 0;
    p.variants.forEach((v, j) => {
      if (skus.has(v.sku))
        add(`commerce.products[${i}].variants[${j}]`, `Duplicate SKU "${v.sku}".`);
      skus.add(v.sku);
      if (v.isDefault) defaultCount += 1;
      checkOptionMap(`commerce.products[${i}].variants[${j}].optionValues`, v.optionValues);
      if (p.options.length > 0 && Object.keys(v.optionValues).length !== p.options.length)
        add(
          `commerce.products[${i}].variants[${j}].optionValues`,
          `Must set every option (${p.options.map((o) => o.name).join(', ')}).`
        );
    });
    if (defaultCount > 1)
      add(`commerce.products[${i}]`, `Only one variant may be isDefault (found ${defaultCount}).`);

    let primaryCount = 0;
    p.images.forEach((img, j) => {
      checkAsset(`commerce.products[${i}].images[${j}].assetId`, img.assetId);
      if (img.isPrimary) primaryCount += 1;
      if (img.variantSku && !skus.has(img.variantSku))
        add(
          `commerce.products[${i}].images[${j}].variantSku`,
          `Unknown variant SKU "${img.variantSku}".`
        );
      checkOptionMap(`commerce.products[${i}].images[${j}].optionValues`, img.optionValues);
    });
    if (primaryCount > 1)
      add(`commerce.products[${i}]`, `Only one image may be isPrimary (found ${primaryCount}).`);
  });

  // ── Content entries ─────────────────────────────────────────────────────────
  const declaredTypeKeys = new Set(bp.contentTypes.map((t) => t.key));
  const slugByType = new Map<string, Set<string>>();
  bp.content.forEach((e, i) => {
    if (!BUILT_IN_TYPE_KEYS.has(e.typeKey) && !declaredTypeKeys.has(e.typeKey))
      add(
        `content[${i}].typeKey`,
        `Unknown content type "${e.typeKey}" (not built-in and not declared in contentTypes).`
      );
    checkAsset(`content[${i}].seo.ogImageAssetId`, e.seo?.ogImageAssetId);
    for (const id of collectAssetRefs(e.body))
      if (!assetExists(id)) add(`content[${i}].body`, `Body references unknown asset "${id}".`);
    if (e.slug) {
      const set = slugByType.get(e.typeKey) ?? new Set<string>();
      if (set.has(e.slug))
        add(`content[${i}].slug`, `Duplicate slug "${e.slug}" for type "${e.typeKey}".`);
      set.add(e.slug);
      slugByType.set(e.typeKey, set);
    }
  });

  // ── Site pages ──────────────────────────────────────────────────────────────
  const sitePages = bp.site?.pages ?? [];
  const singletonSlugs = new Set<string>();
  const defaultByRecordType = new Map<string, number>();
  sitePages.forEach((pg, i) => {
    if (pg.kind === 'collection' && !pg.recordType)
      add(`site.pages[${i}]`, `Collection page "${pg.name}" needs a recordType.`);
    if (pg.kind === 'singleton' && pg.recordType)
      add(`site.pages[${i}]`, `Singleton page "${pg.name}" must not set a recordType.`);
    if (pg.isDefault && pg.kind !== 'collection')
      add(`site.pages[${i}]`, `Only a collection page can be a recordType default.`);
    if (pg.kind === 'singleton' && pg.slug) {
      if (singletonSlugs.has(pg.slug))
        add(`site.pages[${i}].slug`, `Duplicate page slug "${pg.slug}".`);
      singletonSlugs.add(pg.slug);
    }
    if (pg.isDefault && pg.recordType)
      defaultByRecordType.set(pg.recordType, (defaultByRecordType.get(pg.recordType) ?? 0) + 1);
  });
  for (const [rt, count] of defaultByRecordType)
    if (count > 1)
      add('site.pages', `Multiple default templates for recordType "${rt}" (${count}).`);

  // A silica site must have exactly one home page (slug `''`/absent) — the route
  // every other page's chrome links back to, and what `pages[0]` means to silica.
  const homes = sitePages.filter((pg) => pg.kind === 'singleton' && !pg.slug).length;
  if (sitePages.length > 0 && homes !== 1)
    add('site.pages', `A site needs exactly one home page (slug omitted or ""); found ${homes}.`);

  // ── Scheduling (resources, policies, services) ──────────────────────────────
  const scheduling = bp.scheduling;
  if (scheduling) {
    // Locations first — resources and services reference them by handle, and a
    // dangling reference has to FAIL THE LOAD rather than fall back silently.
    // Falling back would file the barber's chairs at whatever place happened to
    // exist, which looks correct until someone opens the second business's diary.
    const locationHandles = new Set<string>();
    scheduling.locations.forEach((l, i) => {
      if (locationHandles.has(l.handle))
        add(`scheduling.locations[${i}]`, `Duplicate location handle "${l.handle}".`);
      locationHandles.add(l.handle);
    });

    const resourceHandles = new Set<string>();
    scheduling.resources.forEach((r, i) => {
      if (resourceHandles.has(r.handle))
        add(`scheduling.resources[${i}]`, `Duplicate resource handle "${r.handle}".`);
      resourceHandles.add(r.handle);
      if (r.locationHandle && !locationHandles.has(r.locationHandle))
        add(`scheduling.resources[${i}].locationHandle`, `Unknown location "${r.locationHandle}".`);
      checkAsset(`scheduling.resources[${i}].imageAssetId`, r.imageAssetId);
      r.windows.forEach((w, j) => {
        if (w.endMinute <= w.startMinute)
          add(
            `scheduling.resources[${i}].windows[${j}]`,
            `Window end (${w.endMinute}) must be after start (${w.startMinute}).`
          );
      });
    });

    const policyHandles = new Set<string>();
    scheduling.policies.forEach((p, i) => {
      if (policyHandles.has(p.handle))
        add(`scheduling.policies[${i}]`, `Duplicate policy handle "${p.handle}".`);
      policyHandles.add(p.handle);
    });

    const serviceHandles = new Set<string>();
    scheduling.services.forEach((s, i) => {
      if (serviceHandles.has(s.handle))
        add(`scheduling.services[${i}]`, `Duplicate service handle "${s.handle}".`);
      serviceHandles.add(s.handle);
      checkAsset(`scheduling.services[${i}].imageAssetId`, s.imageAssetId);
      if (s.policyHandle && !policyHandles.has(s.policyHandle))
        add(`scheduling.services[${i}].policyHandle`, `Unknown policy "${s.policyHandle}".`);
      if (s.locationHandle && !locationHandles.has(s.locationHandle))
        add(`scheduling.services[${i}].locationHandle`, `Unknown location "${s.locationHandle}".`);
    });
  }

  // ── requiresModules sanity ──────────────────────────────────────────────────
  const mods = new Set(bp.requiresModules);
  const hasCommerce =
    commerce.products.length > 0 ||
    commerce.categories.length > 0 ||
    commerce.collections.length > 0;
  if (hasCommerce && !mods.has('commerce'))
    add('requiresModules', `Commerce content present but "commerce" is not listed.`);
  if (bp.content.length > 0 && !mods.has('cms'))
    add('requiresModules', `Content entries present but "cms" is not listed.`);
  if (bp.emails.length > 0 && !mods.has('email'))
    add('requiresModules', `Emails present but "email" is not listed.`);
  if (bp.site && !mods.has('builder'))
    add('requiresModules', `An authored site is present but "builder" is not listed.`);
  if (bp.scheduling && bp.scheduling.services.length > 0 && !mods.has('scheduling'))
    add('requiresModules', `Scheduling services present but "scheduling" is not listed.`);

  return issues;
}

/** Parse + fully validate a blueprint. Throws on a Zod error or any integrity
 *  issue. Use this when authoring/loading a blueprint that must be correct. */
export function parseBlueprint(input: unknown): Blueprint {
  const bp = BlueprintSchema.parse(input);
  const issues = validateBlueprintIntegrity(bp);
  if (issues.length > 0) throw new BlueprintValidationError(issues);
  return bp;
}

export type SafeParseResult =
  { success: true; data: Blueprint } | { success: false; issues: BlueprintIssue[] };

/** Non-throwing parse + validate — returns the issues for surfacing in a UI. */
export function safeParseBlueprint(input: unknown): SafeParseResult {
  const parsed = BlueprintSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      issues: parsed.error.issues.map((e) => ({
        path: e.path.join('.') || 'root',
        message: e.message,
      })),
    };
  const issues = validateBlueprintIntegrity(parsed.data);
  if (issues.length > 0) return { success: false, issues };
  return { success: true, data: parsed.data };
}
