'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE CATEGORY DATA LAYER
//
// Categories are the browsable TREE a shopper walks down — "Outdoor › Camping ›
// Cookware". A product lives in one canonical category (and may be filed in
// more), and the tree is what builds the menu on the website.
//
// This module owns every category-shaped read and write the management surfaces
// make: the list, the create/edit pane, and the parent picker. It does NOT
// re-declare the tree reader the product editor's filing picker already uses —
// that lives in products-data.ts under `['commerce','categories','tree']`, and
// re-declaring it under a second key is how a rename saved here would leave the
// product picker showing the old name. So the tree reader and its flattener are
// RE-EXPORTED from here, one implementation, one cache entry.
//
// ── The key contract ──────────────────────────────────────────────────────
//
//   ['commerce','categories']              the root every category read nests under
//   ['commerce','categories','tree']       the whole nested tree (shared reader)
//   ['commerce','categories','list',{q}]   the list surface's window
//   ['commerce','categories', id]          one category, in full
//
// Every write invalidates the ROOT prefix, which by construction reaches the
// tree, the list, the detail, AND the product editor's filing picker — a new or
// renamed category has to appear in all four or one of them is quietly lying.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
import { slugify as slugifyWebSegment } from '../../lib/slugify';

// The tree reader + flattener are the SAME ones the product filing picker uses.
// Re-exported so every category surface imports its tree shape from one place,
// while there is only ever one fetch of it.
export {
  useCategoryTree,
  flattenCategories,
  type CategoryNode,
  type CategoryChoice,
} from './products-data';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/**
 * One category in full, as the detail pane edits it. Mirrors the api-rest
 * `CategoryRow` (category-service `get`): the tree overview omits the heavier
 * fields, so this is only ever the single-category read.
 */
export interface CategoryDetail {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parentId: string | null;
  /** The server's materialized path of handles — read-only here, used to keep a
   *  category from being made its own ancestor in the parent picker. */
  path: string;
  position: number;
  featured: boolean;
  iconMediaId: string | null;
  heroMediaId: string | null;
  /** Products a SHOPPER finds under this heading on the site being worked in.
   *  Filed-in-total is this plus `hiddenProductCount` — the delete confirmation
   *  wants the sum, because that is what a delete detaches (issue 382). */
  productCount: number;
  /** Filed here but not on the website: archived, still a draft, or kept for one
   *  of the business's other sites. */
  hiddenProductCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  /** Sites this category is shown on. EMPTY means every site — the default. */
  propertyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const categoryKeys = {
  all: ['commerce', 'categories'] as const,
  detail: (id: string) => [...categoryKeys.all, id] as const,
};

/* ── Queries ────────────────────────────────────────────────────────────── */

export function useCategory(id: string) {
  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: () => api.get<CategoryDetail>(`/v1/commerce/categories/${id}`),
    enabled: id !== 'new',
    // A 404 means the category was deleted, not that the server broke — do not
    // retry it into a generic failure.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/**
 * The one way anything in this cluster says "a category changed".
 *
 * Invalidates the ROOT prefix, which reaches the tree, the list, the detail and
 * the product editor's filing picker in one call. A name, a parent or a product
 * count can each show in several of those places, so a narrower invalidate is a
 * stale number waiting to happen.
 */
export function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: categoryKeys.all });
    if (id) void queryClient.invalidateQueries({ queryKey: categoryKeys.detail(id) });
  };
}

/* ── Mutations ──────────────────────────────────────────────────────────── */

/** What create and edit write. Parent is set on create and MOVED with reparent,
 *  never through this — the server refuses a parent change on the plain update
 *  (it rewrites the whole subtree's paths), so the two are kept apart. */
export interface CategoryInput {
  name: string;
  handle?: string;
  description?: string | null;
  parentId?: string | null;
  position?: number;
  featured?: boolean;
  iconMediaId?: string | null;
  heroMediaId?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogImageId?: string | null;
  /** The full replacement set of sites. Empty = every site. */
  propertyIds?: string[];
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (input: CategoryInput) =>
      api.post<{ id: string; handle: string }>('/v1/commerce/categories', input),
    onSuccess: (created) => {
      invalidate(created.id);
    },
  });
}

export function useUpdateCategory(id: string) {
  const invalidate = useInvalidateCategories();
  return useMutation({
    // Update never carries `parentId` — a move goes through reparent. The caller
    // strips it before handing the patch here.
    mutationFn: (patch: Omit<CategoryInput, 'parentId'>) =>
      api.patch(`/v1/commerce/categories/${id}`, patch),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/**
 * Move a category under a new parent (or to the top level) and set its place
 * among its siblings.
 *
 * Separate from update because the server rewrites every descendant's path in
 * the same transaction and guards against moving a category into its own
 * subtree — neither of which a field patch should silently trigger.
 */
export function useReparentCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (input: { categoryId: string; newParentId: string | null; newPosition: number }) =>
      api.post('/v1/commerce/categories/reparent', input),
    onSuccess: (_data, input) => {
      invalidate(input.categoryId);
    },
  });
}

export function useDeleteCategory(id: string) {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: () => api.delete(`/v1/commerce/categories/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/**
 * The server's own sentence for a 4xx is worth showing verbatim — these routes
 * explain the actual problem ("Category has 3 descendant categories — remove or
 * reparent them first", "Handle is already taken") far better than a status
 * code. A 5xx carries no such sentence, so it falls back to the caller's wording.
 */
export function categoryErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** A handle is the part of a web address that identifies this category, so it is
 *  lowercase, digits and hyphens — matching what api-rest derives from a name. */
export function slugifyHandle(value: string): string {
  return slugifyWebSegment(value, 120);
}
