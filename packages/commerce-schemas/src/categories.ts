// Categories (nested tree) + Collections (manual list or rule-driven).
//
// Distinct concepts: categories are the *organizational tree* (Auto Parts >
// Engine > Fuel Injection); a product lives in one canonical category but
// can appear in many collections. Collections are the *merchandising
// surface* — "Featured", "New for Spring", "Diesel Service Specials" —
// either hand-curated or driven by a rule set evaluated at render time.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { Handle, MoneyCents } from './common';
import { SeoFields } from './products';

// ─── Category (nested tree, ltree-backed) ─────────────────────────────

export const CreateCategoryInput = z.object({
  name: z.string().min(1).max(127),
  handle: Handle.optional(),
  description: z.string().max(10_000).optional(),
  parentId: Uuid.nullable().optional(),
  position: z.number().int().nonnegative().default(0),
  featured: z.boolean().default(false),
  iconMediaId: Uuid.optional(),
  heroMediaId: Uuid.optional(),
  ...SeoFields.shape,
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

export const UpdateCategoryInput = CreateCategoryInput.partial();
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;

export const ReparentCategoryInput = z.object({
  categoryId: Uuid,
  newParentId: Uuid.nullable(),
  newPosition: z.number().int().nonnegative(),
});
export type ReparentCategoryInput = z.infer<typeof ReparentCategoryInput>;

// ─── Collection rule set ──────────────────────────────────────────────
//
// Rules are evaluated at index time (Typesense reindex) — not at every
// page load — so changing a rule re-projects the membership async via the
// commerce-indexer worker. Match modes mirror Shopify's vocabulary.

export const CollectionPredicate = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('title'),
    op: z.enum(['contains', 'equals', 'starts_with', 'ends_with']),
    value: z.string().min(1).max(255),
  }),
  z.object({
    field: z.literal('vendor'),
    op: z.enum(['equals', 'in']),
    value: z.union([z.string().min(1).max(127), z.array(z.string()).max(50)]),
  }),
  z.object({
    field: z.literal('product_type'),
    op: z.enum(['equals', 'in']),
    value: z.union([z.string().min(1).max(127), z.array(z.string()).max(50)]),
  }),
  z.object({
    field: z.literal('tag'),
    op: z.enum(['equals', 'any_of', 'all_of', 'none_of']),
    value: z.union([z.string().min(1).max(63), z.array(z.string()).max(50)]),
  }),
  z.object({
    field: z.literal('price'),
    op: z.enum(['lt', 'lte', 'gt', 'gte', 'between']),
    value: z.union([MoneyCents, z.tuple([MoneyCents, MoneyCents])]),
  }),
  z.object({
    field: z.literal('inventory'),
    op: z.enum(['in_stock', 'out_of_stock', 'low_stock']),
    value: z.boolean().default(true),
  }),
  z.object({
    field: z.literal('fitment'),
    op: z.literal('matches'),
    value: z.object({
      makeId: Uuid.optional(),
      modelId: Uuid.optional(),
      engineId: Uuid.optional(),
      year: z.number().int().min(1900).max(2100).optional(),
    }),
  }),
]);
export type CollectionPredicate = z.infer<typeof CollectionPredicate>;

export const CollectionRuleSet = z.object({
  match: z.enum(['all', 'any']).default('all'),
  predicates: z.array(CollectionPredicate).min(1).max(20),
});
export type CollectionRuleSet = z.infer<typeof CollectionRuleSet>;

// ─── Collection ───────────────────────────────────────────────────────

export const CollectionType = z.enum(['manual', 'rules']);
export type CollectionType = z.infer<typeof CollectionType>;

export const CreateCollectionInput = z.object({
  name: z.string().min(1).max(127),
  handle: Handle.optional(),
  description: z.string().max(10_000).optional(),
  type: CollectionType.default('manual'),
  ruleSet: CollectionRuleSet.optional(), // required when type=rules
  heroMediaId: Uuid.optional(),
  featured: z.boolean().default(false),
  ...SeoFields.shape,
});
export type CreateCollectionInput = z.infer<typeof CreateCollectionInput>;

export const UpdateCollectionInput = CreateCollectionInput.partial();
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionInput>;

export const SetCollectionProductsInput = z.object({
  collectionId: Uuid,
  productIds: z.array(Uuid).max(5000),
});
export type SetCollectionProductsInput = z.infer<typeof SetCollectionProductsInput>;
