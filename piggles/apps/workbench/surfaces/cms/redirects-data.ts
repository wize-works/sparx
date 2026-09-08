'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE REDIRECTS DATA LAYER
//
// A redirect sends anyone who follows an old link to the new page instead of
// hitting a dead end. A rule can be created, imported in bulk, REPOINTED, or
// deleted. This module said there was no "edit a redirect" on this platform and
// no PATCH on the server, and both were true until the refusal for a duplicate
// turned out to have no remedy behind it (issue 396).
//
// api-rest is snake_case on the wire (see `toApiRedirect` in
// wizeworks/services/api-rest/src/routes/v1/redirects) and `hit_count` arrives as a plain
// number the route already converted from a Prisma BigInt. We keep those field
// names verbatim rather than re-mapping, so there is one spelling of each field
// between the server and the screen.
// ══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import { useActivePropertyId } from '../../lib/api/shell-data';
import { useDomains } from '../domains/data';
import type { RedirectStatusCode } from './redirects-format';
import type { RedirectParseContext } from './redirects-parse';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** One redirect rule, exactly as api-rest serialises it. `property_id` is the
 *  site whose address this fires on, or `null` for a rule shared across every
 *  site the business runs. */
export interface Redirect {
  id: string;
  property_id: string | null;
  from_path: string;
  to_path: string;
  status_code: RedirectStatusCode;
  hit_count: number;
  created_at: string;
}

/** What POST /v1/redirects/bulk reports back: how many rules went in, and every
 *  row it turned away with the reason (a duplicate, a loop, its own reflection).
 *  `row` is the index into the array that was SENT, not the source line. */
export interface BulkImportResult {
  inserted: number;
  skipped: { row: number; reason: string }[];
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

export interface RedirectQuery {
  take: number;
  skip: number;
}

export const redirectKeys = {
  all: ['cms', 'redirects'] as const,
  lists: () => [...redirectKeys.all, 'list'] as const,
  list: (query: RedirectQuery) => [...redirectKeys.lists(), query] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

/**
 * The redirects that fire on the site being worked in, plus any shared across
 * every site — the server resolves that scope from the `x-sparx-property-id`
 * header the client attaches, so the pane never has to think about it. Ordered
 * by the old address, which is how someone hunts for "the rule on /old-pricing".
 */
export function useRedirects(query: RedirectQuery) {
  return useQuery({
    queryKey: redirectKeys.list(query),
    queryFn: () => api.list<Redirect>('/v1/redirects', { take: query.take, skip: query.skip }),
    // Keeps the current window on screen while the next page loads, so paging
    // never blinks the table out to an empty state and back.
    placeholderData: (previous) => previous,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/** The one way anything here says "that changed": refresh every list window.
 *  There are no detail panes to touch — a rule is edited in a dialog over the
 *  list, so the list is the only thing holding it. */
function useInvalidateRedirects() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: redirectKeys.lists() });
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

export interface CreateRedirectInput {
  from_path: string;
  to_path: string;
  status_code: RedirectStatusCode;
}

/** Add one redirect. `property_id` is deliberately omitted so the server lands
 *  it on the site being worked in — the same default the bulk import uses. */
export function useCreateRedirect() {
  const invalidate = useInvalidateRedirects();
  return useMutation({
    mutationFn: (input: CreateRedirectInput) => api.post<Redirect>('/v1/redirects', input),
    onSuccess: () => {
      invalidate();
    },
  });
}

/**
 * Change where one redirect points, or whether the move is permanent.
 *
 * The old address is NOT editable. It is the rule's identity — the link people
 * are still following — so changing it is a different rule rather than a
 * correction, and the honest way to do that is to remove this one and add the
 * new one, which says out loud that the old address goes dead.
 */
export function useUpdateRedirect(id: string) {
  const invalidate = useInvalidateRedirects();
  return useMutation({
    mutationFn: (input: { to_path: string; status_code: RedirectStatusCode }) =>
      api.patch<Redirect>(`/v1/redirects/${id}`, input),
    onSuccess: () => {
      invalidate();
    },
  });
}

/** Import a batch. Partial success is normal and expected: the server inserts
 *  what it can and reports the rest as `skipped` with a reason, so the caller
 *  shows which rows still need attention rather than failing the whole import. */
export function useBulkCreateRedirects() {
  const invalidate = useInvalidateRedirects();
  return useMutation({
    mutationFn: (rows: CreateRedirectInput[]) =>
      api.post<BulkImportResult>('/v1/redirects/bulk', { rows }),
    onSuccess: () => {
      invalidate();
    },
  });
}

/** Remove a redirect. The old link goes back to being a dead end, so this is
 *  guarded by a confirm at the call site. */
export function useDeleteRedirect() {
  const invalidate = useInvalidateRedirects();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/redirects/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── The words, and the parsing ─────────────────────────────────────────── */

// Re-exported so every caller keeps importing from one place: what a redirect
// MEANS and how its text is parsed moved to `redirects-format.ts` under RULE
// #0.5, and neither is a different concept from the reader's point of view.
export * from './redirects-format';
// And how a pasted list becomes rows: same reason, same reader's view of it.
export * from './redirects-parse';

/* ── What the bulk import is allowed to know ────────────────────────────── */

/**
 * The two facts that stop the import preview promising something the server
 * will turn down: which web addresses are this business's, and which old
 * addresses already have a rule.
 *
 * Both are already on screen elsewhere, so neither is a new request in any
 * meaningful sense — and without them the preview marked a line "Ready" that it
 * could already tell would be refused (issue 400).
 *
 * ONE PAGE of existing rules, not all of them. It is an advisory pre-check; the
 * server is the authority and now skips a colliding row on its own with a
 * sentence naming where the rule points. A business past 250 rules gets the
 * server's answer rather than a wrong one.
 */
export function useRedirectImportContext(): RedirectParseContext {
  const propertyId = useActivePropertyId();
  const { data: domains } = useDomains();
  const { data: rules } = useRedirects({ take: 250, skip: 0 });

  return useMemo(() => {
    const ownHosts = (domains ?? [])
      .filter((domain) => domain.propertyId === propertyId)
      .map((domain) => domain.host.toLowerCase());
    const existing = new Map<string, string>();
    for (const rule of rules?.items ?? []) existing.set(rule.from_path, rule.to_path);
    return { ownHosts, existing };
  }, [domains, rules, propertyId]);
}
