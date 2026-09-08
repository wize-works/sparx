'use client';

// Every cache key that holds the saved-piece library, and the one call that
// clears all of them.
//
// WHY THIS FILE EXISTS. The same library was cached under three keys across two
// files, and nothing invalidated across the split. The editor wrote
// `['builder','silica-pieces']` and `['studio','site-symbols']`; the Saved pieces
// pane read `['builder','components','list']`. So a clothing maker saved her
// contact form as a piece, watched the toast confirm it, opened Saved pieces and
// read "No saved pieces yet" over a row that was already in the database — and a
// rename in the pane left the editor's Add panel still offering the old name
// (issue 394).
//
// ONE LIST, ONE CALL. `invalidatePieceLibrary` is what every mutation uses, so a
// new one cannot clear half the caches. Adding a fourth key means adding it here,
// which is the only place that can forget it.

import type { QueryClient } from '@wizeworks/query';

/** The site's own pieces, as the canvas resolves them. */
export const SITE_SYMBOLS_KEY = ['studio', 'site-symbols'] as const;

/** The tenant library, as the editor's Add panel reads it. */
export const SILICA_PIECES_KEY = ['builder', 'silica-pieces'] as const;

/** The Saved pieces pane's own reads. Detail is separate from list so a list
 *  refresh can be targeted WITHOUT re-touching an open detail — which matters on
 *  delete, where refetching a just-deleted (still-mounted) detail would 404
 *  mid-close. */
export const pieceKeys = {
  all: ['builder', 'components'] as const,
  list: () => [...pieceKeys.all, 'list'] as const,
  detail: (key: string) => [...pieceKeys.all, 'piece', key] as const,
  usages: (key: string) => [...pieceKeys.all, 'piece', key, 'usages'] as const,
};

/**
 * Clear every cache holding the library, wherever the change was made.
 *
 * `skipDetail` is for delete: the pane closes itself, and refetching a
 * just-deleted detail while dockview commits the close lands a `flushSync` inside
 * a lifecycle method. Everything else still refreshes.
 */
export function invalidatePieceLibrary(
  queryClient: QueryClient,
  options: { skipDetail?: string } = {}
): void {
  void queryClient.invalidateQueries({ queryKey: SILICA_PIECES_KEY });
  void queryClient.invalidateQueries({ queryKey: SITE_SYMBOLS_KEY });
  void queryClient.invalidateQueries({ queryKey: pieceKeys.list() });
  // The detail keys carry the piece's identity AND its where-used count, and a
  // save in the editor changes where it is placed — so they are stale too, not
  // only the list.
  void queryClient.invalidateQueries({
    queryKey: pieceKeys.all,
    predicate: (query) =>
      options.skipDetail === undefined || !query.queryKey.includes(options.skipDetail),
  });
}
