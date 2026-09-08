'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE SAVED-PIECES DATA LAYER
//
// A "saved piece" is a reusable builder component: a part of a page built once
// and dropped onto many. Everything the Saved-pieces list and the piece detail
// read or write goes through here, so the two can never disagree about a field
// one of them forgot to fetch — and a rename in the detail refreshes the row in
// the list docked beside it.
//
// This endpoint is TENANT-scoped, not property-scoped: a saved piece belongs to
// the whole business and can be placed on any of its sites, so there is no
// `?property=` here (docs/53). The active-property header the client attaches
// only resolves WHICH tenant; the pieces themselves are shared across sites.
//
// Unlike the content API (snake_case), the builder component DTOs come off the
// wire in camelCase — see `toSummary`/`toDto` in @wizeworks/builder's
// component-service. We carry those names verbatim rather than re-mapping, so
// there is one spelling of each field between the server and the screen, and we
// carry the SHAPE only — no @wizeworks/builder-schemas dependency in the workbench.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
import { invalidatePieceLibrary, pieceKeys } from '../../lib/studio/piece-keys';

/* ── Shapes (mirrors of @wizeworks/builder-schemas DTOs, carried not imported) ── */

/** What a piece IS, as a category — how the builder's Add palette files it. */
export type PieceGroup = 'layout' | 'content' | 'data';

/** Where a piece may be placed: on a page, in the site chrome (header/footer),
 *  or in an email. Most pieces are page-only. */
export type PieceSurface = 'page' | 'site' | 'email';

/** A saved piece WITHOUT its design tree — the list row. */
export interface PieceSummary {
  id: string;
  /** The stable identifier used everywhere it is referenced (`custom:<key>`).
   *  This — not `id` — is what the CRUD routes address. */
  key: string;
  name: string;
  group: PieceGroup;
  icon: string;
  description: string | null;
  surfaces: PieceSurface[];
  latestVersion: number;
  /** Whether the editor can actually open and place this piece.
   *
   *  False for a piece authored in the RETIRED builder: its design is stored in that
   *  builder's node format, which the current editor cannot read. Nothing converts
   *  between the two (the cutover re-seeded pages rather than migrating them), so
   *  such a piece is a record of something that once existed, not a usable one. The
   *  UI has to say that rather than offering an "Edit design" button that opens an
   *  editor showing nothing. */
  placeable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One node of a piece's design tree. We only ever READ it (to count blocks and
 *  name the outermost element for the preview), so it carries the shape loosely. */
export interface PieceNode {
  id: string;
  type: string;
  name?: string;
  children?: PieceNode[];
}

/** A saved piece WITH its latest design — the detail read.
 *
 *  BOTH tree fields are nullable and a piece carries one of them: `tree` on a piece
 *  built in the retired editor, `silicaTree` on anything current (`placeable`).
 *  Neither is read for its content here — the detail pane counts blocks and hands
 *  the design off to the studio — so both stay loosely shaped. */
export interface Piece extends PieceSummary {
  tree: PieceNode | null;
  silicaTree: PieceNode | null;
  propSpec: unknown[];
}

/** Where a piece is placed — the delete-impact / "changes everywhere" read. A
 *  page or layout appears if EITHER its draft or its live tree uses the piece. */
export interface PieceUsage {
  pages: { id: string; name: string }[];
  layouts: { id: string; name: string }[];
  total: number;
  /** How many of those would REFUSE a delete. Not the same as `total`: a piece
   *  placed by the current editor DETACHES — the page keeps the design and stops
   *  following the master — so it is used without standing in the way. */
  blocking: number;
  pinnedVersions: number[];
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

// Owned by `lib/studio/piece-keys.ts`, alongside the two keys the EDITOR caches
// the same library under. It lived here, they lived there, and nothing cleared
// across the split — so a piece saved in the editor left this pane reading "No
// saved pieces yet" over a row already in the database (issue 394).
export { pieceKeys };

/* ── Reads ──────────────────────────────────────────────────────────────── */

/**
 * Every saved piece this business has, no design trees. The endpoint returns the
 * whole set in one shot (there is no server paging) — the set is a small,
 * curated library, so it is filtered and grouped in the browser.
 */
export function useSavedPieces() {
  return useQuery({
    queryKey: pieceKeys.list(),
    queryFn: () =>
      api.get<{ components: PieceSummary[] }>('/v1/builder/components').then((r) => r.components),
  });
}

/** One piece, with its latest design — what the detail pane manages. */
export function useSavedPiece(key: string) {
  return useQuery({
    queryKey: pieceKeys.detail(key),
    queryFn: () => api.get<Piece>(`/v1/builder/components/${encodeURIComponent(key)}`),
    enabled: key !== '',
    // A 404 means deleted, not broken — don't retry it into a generic failure.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/** Where a piece is placed. Its own query so the detail can refresh reach
 *  independently of the piece's identity, and so the delete-impact warning
 *  always reads the current truth. */
export function useSavedPieceUsage(key: string) {
  return useQuery({
    queryKey: pieceKeys.usages(key),
    queryFn: () => api.get<PieceUsage>(`/v1/builder/components/${encodeURIComponent(key)}/usages`),
    enabled: key !== '',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

export interface UpdatePieceInput {
  name?: string;
  description?: string | null;
}

/** Rename / re-describe a piece. Identity only — the DESIGN is edited in the
 *  builder studio, which snapshots a new version; this never touches the tree. */
export function useUpdatePiece(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePieceInput) =>
      api.patch<Piece>(`/v1/builder/components/${encodeURIComponent(key)}`, input),
    onSuccess: () => {
      // The whole library, not just this pane's two keys — a rename here is the
      // name the editor's Add panel offers.
      invalidatePieceLibrary(queryClient);
    },
  });
}

/** Delete a piece and all its versions. The server REFUSES this while the piece
 *  is still placed on any page or layout (it would orphan the placement), so the
 *  detail pane guides the operator to remove those placements first and surfaces
 *  the server's own sentence if the delete is nonetheless blocked (a race). */
export function useDeletePiece(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/v1/builder/components/${encodeURIComponent(key)}`),
    onSuccess: () => {
      // Everything EXCEPT this piece's own detail: the delete closes this pane,
      // and disturbing its still-mounted observer while dockview commits the
      // close lands a flushSync inside a lifecycle method. The editor's caches
      // still have to go — a deleted piece must stop appearing in Add.
      invalidatePieceLibrary(queryClient, { skipDetail: key });
    },
  });
}

/* ── Saying what a state means ──────────────────────────────────────────── */

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * What a piece's REACH means, in an owner's words with the tone that colors its
 * badge. Reach is the defining fact of a reusable piece: the whole promise is
 * "change it here and it changes everywhere it appears", so how many places that
 * is has to be said plainly.
 */
export function usageState(total: number): { label: string; tone: Tone; detail: string } {
  if (total === 0) {
    return {
      label: 'Not used yet',
      tone: 'neutral',
      detail:
        'This piece is saved but not on any page yet. Open it in the editor and drop it onto a page — then it appears wherever you place it, and any change you make here reaches all of them.',
    };
  }
  return {
    label: total === 1 ? 'On 1 page' : `On ${String(total)} places`,
    tone: 'info',
    detail:
      total === 1
        ? 'This piece appears in 1 place. Anything you change here — its name, or its design in the editor — updates that place too.'
        : `This piece appears in ${String(total)} places. Anything you change here — its name, or its design in the editor — updates every one of them at once.`,
  };
}

interface GroupMeta {
  label: string;
  description: string;
}

/** Friendly heading + one line for each category, and the order they read in.
 *  The raw keys (layout/content/data) are builder jargon; owners see plain words. */
export const PIECE_GROUP_ORDER: PieceGroup[] = ['layout', 'content', 'data'];

export function groupMeta(group: PieceGroup): GroupMeta {
  switch (group) {
    case 'layout':
      return {
        label: 'Layout & structure',
        description: 'Pieces that arrange a page — banners, section blocks, headers and footers.',
      };
    case 'data':
      return {
        label: 'Live information',
        description:
          'Pieces that pull in things that change on their own, like products or listings.',
      };
    case 'content':
    default:
      return {
        label: 'Content',
        description: 'Pieces made of words and images you drop straight onto a page.',
      };
  }
}

/**
 * A short tag for where a piece can go — but ONLY when that is worth saying.
 * Almost every piece is page-only, so badging "Pages" on every row would be
 * noise repeating what the surface already is. We flag only the pieces that go
 * somewhere unusual (the site chrome, or emails), where it genuinely informs.
 */
export function surfaceScopeTag(surfaces: PieceSurface[]): string | null {
  const special = surfaces.filter((surface) => surface !== 'page');
  if (special.length === 0) return null;
  const parts = special.map((surface) => (surface === 'site' ? 'Site-wide' : 'Emails'));
  return [...new Set(parts)].join(' · ');
}

/** How many blocks a piece is built from — a lightweight, jargon-free preview of
 *  its size without rendering it (the visual view lives in the editor). */
export function countBlocks(tree: PieceNode | null | undefined): number {
  if (!tree) return 0;
  let count = 1;
  for (const child of tree.children ?? []) count += countBlocks(child);
  return count;
}

/**
 * The server's own sentence for a 4xx, shown verbatim: the builder routes explain
 * the real problem ("This component is still placed on pages or layouts…", "A
 * component with key … already exists") far better than a status code can. A 5xx
 * carries no such sentence, so it falls back to the caller's wording.
 */
export function pieceErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** Medium date, or an em dash for nothing. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
