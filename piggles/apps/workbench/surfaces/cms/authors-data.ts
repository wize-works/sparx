'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE AUTHORS DATA LAYER
//
// Full CRUD for editorial authors — the people whose names appear on published
// content. This owns the whole `['cms','authors']` key tree and the `Author`
// wire shape, so the Authors list and the Author editor can never disagree
// about a field, and a Save in the editor refreshes the row in the list docked
// beside it.
//
// Deliberately SEPARATE from content/data.ts. That module carries a read-only
// `useAuthors` for the content editor's byline picker under its OWN
// `['cms','content','authors']` key; this surface owns full CRUD under its own
// key. The two are joined only where it matters: every write here also
// invalidates the content module's byline cache (see `alsoRefreshBylinePicker`),
// so adding or renaming an author is reflected in the picker the editor shows —
// without either module reaching into the other's cache shape.
//
// api-rest is snake_case on the wire (see serialize() in the authors route). We
// keep those names verbatim rather than re-mapping, so there is exactly one
// spelling of each field between the server and the screen.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
// Read-only import: the content module's byline-picker cache key, so a write
// here can refresh the picker the content editor shows. We never mutate its
// data — only invalidate it.
import { contentKeys } from './data';

/* ── Shape ──────────────────────────────────────────────────────────────── */

/**
 * A byline — a public editorial persona, distinct from a staff account. One
 * person can publish under several author names, and an author can outlive the
 * user row it was tied to, so this is its own record with its own name, web
 * address, biography and photo.
 */
export interface Author {
  id: string;
  /** The end of the web address for this author's page — unique per business. */
  slug: string;
  /** The name shown on everything they write. */
  display_name: string;
  bio: string | null;
  /** Optional link to a staff account. Managed elsewhere; carried through here
   *  untouched so an update never clears it. */
  user_id: string | null;
  /** The media asset id of their photo, or null. */
  avatar_asset_id: string | null;
  /**
   * The site this byline writes for, or null for every site the business runs.
   *
   * A byline is a public persona attached to a publication, so a magazine's
   * masthead has no business in a clothing shop's picker — which is exactly what
   * shipped, because the column existed and nothing read it (issue 387). The
   * server resolves the default from `x-sparx-property-id`; this field is what
   * lets the editor say so and change it.
   */
  property_id: string | null;
  created_at: string;
  updated_at: string;
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

export interface AuthorsQuery {
  q?: string;
  take: number;
  skip: number;
}

export const authorsKeys = {
  all: ['cms', 'authors'] as const,
  // The list namespace is separate from the detail keys, so a list refresh can
  // be targeted WITHOUT re-touching every open detail — which matters on delete,
  // where refetching the just-deleted (still-mounted) detail would 404 and
  // re-render the pane mid-close.
  lists: () => [...authorsKeys.all, 'list'] as const,
  list: (query: AuthorsQuery) => [...authorsKeys.lists(), query] as const,
  detail: (id: string) => [...authorsKeys.all, id] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

export function useAuthorsList(query: AuthorsQuery) {
  return useQuery({
    queryKey: authorsKeys.list(query),
    queryFn: () =>
      api.list<Author>('/v1/authors', {
        ...(query.q ? { q: query.q } : {}),
        take: query.take,
        skip: query.skip,
      }),
    // Keeps the current window on screen while the next one loads, so searching
    // doesn't blink the list out to an empty state and back.
    placeholderData: (previous) => previous,
  });
}

export function useAuthor(id: string) {
  return useQuery({
    queryKey: authorsKeys.detail(id),
    queryFn: () => api.get<Author>(`/v1/authors/${id}`),
    // 'new' is the editor before the author exists — nothing to fetch.
    enabled: id !== 'new',
    // A 404 means deleted, not broken — don't retry it into a generic failure.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/** Refresh both this surface's lists and the content editor's byline picker,
 *  since a new/renamed/removed author shows in both. */
function useInvalidateAuthors() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: authorsKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: contentKeys.authors() });
    if (id) {
      void queryClient.invalidateQueries({ queryKey: authorsKeys.detail(id) });
    }
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

export interface CreateAuthorInput {
  display_name: string;
  slug?: string;
  bio?: string;
  avatar_asset_id?: string;
  /** Omitted lands the byline on the site being worked in — the server reads
   *  that from the site switcher's header. An explicit null shares it with
   *  every site. */
  property_id?: string | null;
}

export function useCreateAuthor() {
  const invalidate = useInvalidateAuthors();
  return useMutation({
    mutationFn: (input: CreateAuthorInput) => api.post<Author>('/v1/authors', input),
    onSuccess: (author) => {
      invalidate(author.id);
    },
  });
}

export interface UpdateAuthorInput {
  display_name?: string;
  slug?: string;
  /** null clears the biography; undefined leaves it as it was. */
  bio?: string | null;
  /** null removes the photo; undefined leaves it as it was. */
  avatar_asset_id?: string | null;
  /** null puts the byline on every site; a site id moves it there; undefined
   *  leaves it where it is. Moving is the ONLY way to give one person's name to
   *  more than one site — a second copy is impossible, because the web address
   *  is unique across the whole business. */
  property_id?: string | null;
}

export function useUpdateAuthor(id: string) {
  const invalidate = useInvalidateAuthors();
  return useMutation({
    mutationFn: (input: UpdateAuthorInput) => api.patch<Author>(`/v1/authors/${id}`, input),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDeleteAuthor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/v1/authors/${id}`),
    onSuccess: () => {
      // Only the LIST (and the byline picker) is refreshed. The detail query is
      // deliberately left untouched: the delete closes this pane, and either
      // refetching OR removing detail(id) would synchronously disturb the pane's
      // own still-mounted observer while dockview commits the close — landing a
      // flushSync inside a lifecycle method. Left alone, the deleted author's
      // cache simply garbage-collects once the pane unmounts.
      void queryClient.invalidateQueries({ queryKey: authorsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: contentKeys.authors() });
    },
  });
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/**
 * The server's own sentence for a 4xx, shown verbatim: the authors route
 * explains the real problem ("Slug "jane" is already in use.", "Display name
 * must contain letters or numbers.") far better than a status code can. A 5xx
 * carries no such sentence, so it falls back to the caller's wording.
 */
export function authorErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** A person's name for a tab or a confirm, never a blank. */
export function authorName(author: Pick<Author, 'display_name'>): string {
  const name = author.display_name.trim();
  return name === '' ? 'Untitled author' : name;
}
