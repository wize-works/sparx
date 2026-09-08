'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE TAXONOMY DATA LAYER
//
// Everything the Tags & topics list and the taxonomy editor read or write goes
// through here. One module owns the `Taxonomy` / `TaxonomyTerm` wire shapes and
// the whole `['cms','taxonomies']` key tree, so the list and the editor can
// never disagree about a field one of them forgot to fetch, and adding a term
// in the editor refreshes the term count on the row in the list docked beside
// it.
//
// A TAXONOMY is a way to file content — "Categories", "Tags". Its TERMS are the
// individual labels inside it — "Diesel repair", "Glazed". Terms can be nested
// (a term has a parent) when the taxonomy is `hierarchical`.
//
// api-rest is snake_case on the wire (see the taxonomies route). We keep those
// names verbatim rather than re-mapping, so there is exactly one spelling of
// each field between the server and the screen.
//
// There is no GET for a single taxonomy — the API only lists them — so both the
// list AND the editor read the same one small "all taxonomies" query and pick
// from it. Sharing the query key means a create/rename/delete refreshes both at
// once, and the editor works on a deep link with no list ever opened.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** One vocabulary — "Categories", "Tags" — exactly as api-rest serialises it.
 *  `term_count` is present only on the list read. */
export interface Taxonomy {
  id: string;
  key: string;
  name: string;
  plural_name: string;
  hierarchical: boolean;
  /** Labels on the site being worked in. A vocabulary is shared across a
   *  business's sites but its labels are not — "Diesel repair" is meaningless on
   *  the donut site — so this is the number the list shows (issue 385). */
  term_count: number;
  /** Labels across every site. What a DELETE takes with it, since deleting the
   *  vocabulary cascades to all of them at once — which is why the confirmation
   *  reads this and the list reads the one above. */
  all_sites_term_count: number;
  created_at: string;
  updated_at: string;
}

/** One label inside a taxonomy. `parent_term_id` is what makes a nested tree. */
export interface TaxonomyTerm {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_term_id: string | null;
}

/** A term with its children resolved — what the editor renders the tree from. */
export interface TermNode extends TaxonomyTerm {
  children: TermNode[];
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

export const taxonomyKeys = {
  all: ['cms', 'taxonomies'] as const,
  // One shared list query. There is no per-key detail endpoint, so the editor
  // reads this and selects its one row — which is why the list is deliberately
  // unparameterised (no server `q`): a single cache entry both surfaces share.
  list: () => [...taxonomyKeys.all, 'list'] as const,
  terms: (key: string) => [...taxonomyKeys.all, 'terms', key] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

/** Every taxonomy this business has. A small, bounded set — a handful of
 *  vocabularies — so it loads whole and the list filters in the browser. */
export function useTaxonomies() {
  return useQuery({
    queryKey: taxonomyKeys.list(),
    queryFn: () => api.list<Taxonomy>('/v1/taxonomies', { take: 250 }).then((r) => r.items),
  });
}

/** The one taxonomy the editor is on, picked out of the shared list query so it
 *  never issues a second request and stays in step with the list. */
export function useTaxonomy(key: string) {
  return useQuery({
    queryKey: taxonomyKeys.list(),
    queryFn: () => api.list<Taxonomy>('/v1/taxonomies', { take: 250 }).then((r) => r.items),
    // 'new' is the editor before the taxonomy exists — nothing to pick.
    enabled: key !== 'new',
    select: (items) => items.find((t) => t.key === key) ?? null,
  });
}

/** Every term in one taxonomy, flat. The editor builds the tree from these. */
export function useTerms(key: string) {
  return useQuery({
    queryKey: taxonomyKeys.terms(key),
    queryFn: () => api.get<TaxonomyTerm[]>(`/v1/taxonomies/${key}/terms`),
    enabled: key !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/** The one way anything here says "that changed": refresh the shared list (a
 *  name, a kind, or a term count shows there) and — when a specific taxonomy's
 *  terms moved — that taxonomy's term list. */
function useInvalidate() {
  const queryClient = useQueryClient();
  return (key?: string) => {
    void queryClient.invalidateQueries({ queryKey: taxonomyKeys.list() });
    if (key) void queryClient.invalidateQueries({ queryKey: taxonomyKeys.terms(key) });
  };
}

/* ── Writes: taxonomies ─────────────────────────────────────────────────── */

export interface CreateTaxonomyInput {
  key: string;
  name: string;
  plural_name: string;
  hierarchical: boolean;
}

export function useCreateTaxonomy() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTaxonomyInput) => api.post<Taxonomy>('/v1/taxonomies', input),
    onSuccess: (created) => {
      invalidate(created.key);
    },
  });
}

export interface UpdateTaxonomyInput {
  name?: string;
  plural_name?: string;
  hierarchical?: boolean;
}

export function useUpdateTaxonomy(key: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateTaxonomyInput) => api.patch<Taxonomy>(`/v1/taxonomies/${key}`, input),
    onSuccess: () => {
      invalidate(key);
    },
  });
}

export function useDeleteTaxonomy(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/v1/taxonomies/${key}`),
    onSuccess: () => {
      // Only the LIST is refreshed. The terms query for the just-deleted taxonomy
      // is left alone: the delete closes this pane, and disturbing its own
      // still-mounted observers while the close commits lands a flushSync inside
      // a lifecycle method. The cache garbage-collects once the pane unmounts.
      void queryClient.invalidateQueries({ queryKey: taxonomyKeys.list() });
    },
  });
}

/* ── Writes: terms ──────────────────────────────────────────────────────── */

export interface CreateTermInput {
  name: string;
  slug?: string;
  description?: string;
  parent_term_id?: string | null;
}

export function useCreateTerm(key: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTermInput) =>
      api.post<TaxonomyTerm>(`/v1/taxonomies/${key}/terms`, input),
    onSuccess: () => {
      invalidate(key);
    },
  });
}

export interface UpdateTermInput {
  name?: string;
  slug?: string;
  description?: string | null;
  parent_term_id?: string | null;
}

export function useUpdateTerm(key: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTermInput }) =>
      api.patch<TaxonomyTerm>(`/v1/taxonomies/${key}/terms/${id}`, input),
    onSuccess: () => {
      invalidate(key);
    },
  });
}

export function useDeleteTerm(key: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/taxonomies/${key}/terms/${id}`),
    onSuccess: () => {
      invalidate(key);
    },
  });
}

/* ── Tree helpers ───────────────────────────────────────────────────────── */

/** Turn the flat term list into a nested tree, sorted by name at every level —
 *  the same order the API returns, kept consistent as the tree is walked. */
export function buildTermTree(terms: TaxonomyTerm[]): TermNode[] {
  const byId = new Map<string, TermNode>();
  for (const term of terms) byId.set(term.id, { ...term, children: [] });

  const roots: TermNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.parent_term_id;
    const parent = parentId ? byId.get(parentId) : undefined;
    // A term whose parent is missing (deleted, or on another site) is orphaned
    // to the top level rather than dropped — losing it from view is worse.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (nodes: TermNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

/**
 * Every term that sits UNDER `termId`, at any depth.
 *
 * Used to stop the parent picker offering a term's own descendants as its
 * parent — the API only blocks a term being its OWN parent, so a deeper loop
 * (make A a child of B where B is already under A) has to be prevented here.
 */
export function collectDescendants(termId: string, terms: TaxonomyTerm[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const term of terms) {
    if (!term.parent_term_id) continue;
    const list = childrenOf.get(term.parent_term_id) ?? [];
    list.push(term.id);
    childrenOf.set(term.parent_term_id, list);
  }

  const out = new Set<string>();
  const stack = [termId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const child of childrenOf.get(current) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

/* ── Saying what a thing is ─────────────────────────────────────────────── */

/** What kind of vocabulary this is, in plain words. Nested is the notable trait
 *  and gets a badge; a flat list is the unmarked default and gets none. */
export function taxonomyKind(hierarchical: boolean): { label: string; detail: string } | null {
  if (!hierarchical) return null;
  return {
    label: 'Nested',
    detail: 'Labels can sit under one another, like Food › Desserts › Cakes.',
  };
}

/**
 * A machine reference from a display name: lowercase letters, numbers and
 * underscores, starting with a letter — the exact shape the API requires for a
 * taxonomy key. Non-technical owners never type this; it is suggested from the
 * name and only shown so an advanced user CAN change it.
 */
export function toKey(name: string): string {
  const collapsed = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  // A key must start with a letter — drop any leading digits/underscores.
  return collapsed.replace(/^[0-9_]+/, '');
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Whether a proposed key is one the API will accept — mirrored from the route's
 *  own zod rule so the editor can say so before it round-trips. */
export function isValidKey(key: string): boolean {
  return key.length > 0 && key.length <= 63 && KEY_PATTERN.test(key);
}

/**
 * The server's own sentence for a 4xx, shown verbatim: the taxonomy routes
 * explain the real problem ("Slug "specials" already exists in "blog_tag"",
 * "Taxonomy "blog_tag" already exists") far better than a status code can. A
 * 5xx carries no such sentence, so it falls back to the caller's wording.
 */
export function taxonomyErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}
