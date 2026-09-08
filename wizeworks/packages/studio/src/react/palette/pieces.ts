// The author's own saved pieces, as rows in Insert.
//
// Save as piece was one-directional without this. A design could be turned into a
// master and an instance left in its place, the piece appeared in the Saved pieces
// list, and its own manage screen said "drop it onto a page" — but the Insert rail
// offered silica's catalog and nothing else, so there was no way to put it on a
// SECOND page. The half that makes a piece worth having (change it once, it changes
// everywhere) could never be reached, because it could only ever be in one place.
//
// A row builds an INSTANCE, never a copy of the master's tree. A copy would look
// identical on the day it was placed and then quietly stop following the master,
// which is the failure this feature exists to prevent.

import type { PaletteGroup } from '@wizeworks/silicaui-builder/react';
import type { Node } from '@wizeworks/silicaui-html';
import type { DocumentKind } from '../../documents/types';
import type { StudioSession } from '../../session/session';

export const PIECES_GROUP_KEY = 'studio_pieces';

/**
 * Pages and layouts, and deliberately not the piece builder itself.
 *
 * An instance expands its master at draw time, so a piece placed inside its own
 * master is a cycle the canvas walks until the tab stops responding. Excluding the
 * document being edited would close the one-step case and leave A → B → A open, and
 * a hang is not an acceptable failure for a wrong click. Nesting pieces needs a real
 * cycle check before it is offered; placing them where the product promises they go
 * does not.
 */
function offersPieces(kind: DocumentKind): boolean {
  return kind === 'page' || kind === 'layout';
}

/** The group to append to Insert, or nothing when this document takes no pieces
 *  and when the author has not saved any. */
export function piecesGroup(session: StudioSession, kind: DocumentKind): PaletteGroup | undefined {
  if (!offersPieces(kind)) return undefined;

  const items = Object.values(session.symbols())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((symbol) => ({
      key: `piece:${symbol.id}`,
      label: symbol.name,
      icon: 'shared' as const,
      // HER note first. The manage screen asks "What it's for" and then promises
      // that answer shows up here, which it did not: every piece read the same
      // generic sentence, so the one place a shop owner could tell two of her own
      // pieces apart said the same thing about both. The sentence stays as the
      // fallback, because a piece she has not annotated still needs the one fact a
      // first-timer is missing.
      hint:
        session.pieceNote(symbol.id) ?? 'Your saved piece — edit it once and every copy follows',
      // Id-free by contract: the palette stamps ids on the way in, and minting one
      // here would hand the same id to every insert.
      make: (): Node => ({ kind: 'element', tag: 'div', instanceOf: symbol.id, children: [] }),
    }));

  if (!items.length) return undefined;
  return { key: PIECES_GROUP_KEY, label: 'Your saved pieces', items };
}
