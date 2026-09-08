'use client';

// Insert — the click-to-add / drag-to-add surface.
//
// A row is BOTH a button and a drag source, and neither is redundant. Clicking is
// how you add something without aiming, and the engine decides where it lands;
// dragging is how you put it in one exact place. An author who has not yet built
// a mental model of the tree uses the first, and stops needing it.
//
// Both gestures work with a finger. Tapping always did; dragging did not, because
// the browser's own drag-and-drop is never delivered by touch — so a row is also
// a press-and-hold source (`useDragSource`), which is the same drag over pointer
// events. Holding still lifts it; moving first scrolls the list, as it should.
//
// The catalog is large — silica's primitives plus the app's own composites and
// section library — so the top of the rail is a search box. A grouped browse is
// only useful to someone who already knows which group a thing is in, which is why
// the groups a business owner CAN read come first (see `hostFirst`): the first screen
// has to be recognisable to somebody who has never met the word "container".

import { useCallback, useMemo, useState } from 'react';
import { Input, useToast } from '@wizeworks/silicaui-react';
import {
  mergeCatalog,
  paletteGroups,
  type PaletteGroup,
  type PaletteItem,
} from '@wizeworks/silicaui-builder/react';
import { defaultMakeId, stampTree, type Node } from '@wizeworks/silicaui-html';
import type { TreeDoc } from '../../documents/types';
import { docKey } from '../../documents/types';
import { findPlace, isAddressable } from '../../tree/walk';
import {
  useApply,
  useDoc,
  useDocSnapshot,
  useResolutionVersion,
  useSelect,
  useStudioHost,
  useStudioSession,
} from '../context';
import { useDragSource } from '../drag/pointer-drag';
import { piecesGroup } from './pieces';
import { NODE_DRAG_TYPE } from '../canvas/canvas';
import { StudioIcon } from '../icon';

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'source', 'track', 'wbr', 'embed', 'col']);

interface Ranked {
  item: PaletteItem;
  group: string;
  score: number;
}

/** Rank a row against a query. Lower is better; -1 means no match. */
function score(item: PaletteItem, query: string): number {
  const haystacks = [item.label, item.key, item.hint ?? ''];
  let best = -1;
  for (const value of haystacks) {
    const at = value.toLowerCase().indexOf(query);
    if (at < 0) continue;
    // A prefix match beats a match buried mid-word, so typing "cta" lands the CTA
    // block rather than everything whose hint mentions one.
    const candidate = at === 0 ? 0 : at + 1;
    if (best < 0 || candidate < best) best = candidate;
  }
  return best;
}

/**
 * The host's own groups first, the framework's primitives after them.
 *
 * WHY. `mergeCatalog` appends what a host contributes, which puts the ready-made
 * sections — the ones written in a business owner's language — BELOW every primitive
 * group. On a real shop that measured at 118 rows and about six screens of scrolling
 * before "How it works", "People and proof" or "Getting in touch" came into view, and
 * the eleven rows she met first were Section, Container, Stack, Row, Grid, Card,
 * Clickable Card, App Shell, Scroll Area, Overflow List and Join. Nine of those eleven
 * mean nothing to someone who sews clothes for a living, and an owner who scrolls a
 * screen of them and closes the panel has been told, wrongly, that this is a tool for
 * somebody else. Her About page stayed two paragraphs long.
 *
 * The primitives are not demoted for being unimportant — an author laying out a row
 * of three needs a Grid — but they are what you reach for SECOND, once the shaped
 * thing is on the page and needs adjusting. Search still finds either instantly, and
 * ordering here (rather than in the host's own list) keeps every host on the same
 * side of the decision.
 *
 * BY KEY, and only for a key the base did not already carry: `mergeCatalog` folds a
 * host group into a base group of the same key, and hoisting one of those would move
 * the framework's own rows along with it.
 */
export function hostFirst(
  merged: readonly PaletteGroup[],
  contribution?: { extend?: PaletteGroup[] }
): PaletteGroup[] {
  const base = new Set(paletteGroups().map((group) => group.key));
  const added = new Set(
    (contribution?.extend ?? []).map((group) => group.key).filter((key) => !base.has(key))
  );
  if (added.size === 0) return [...merged];
  return [
    ...merged.filter((group) => added.has(group.key)),
    ...merged.filter((group) => !added.has(group.key)),
  ];
}

export function Palette({ onInserted }: { onInserted?: () => void } = {}) {
  const host = useStudioHost();
  const doc = useDoc<TreeDoc>();
  const { selection } = useDocSnapshot();
  const apply = useApply();
  const select = useSelect();
  const session = useStudioSession();
  const toast = useToast();
  const [query, setQuery] = useState('');

  // The author's own pieces come LAST, under their own heading — they are the
  // shortest list and the one they named themselves, so burying them among two
  // hundred catalog rows would hide the thing they went looking for.
  const version = useResolutionVersion();
  const groups = useMemo(() => {
    const contribution = host.catalog?.(doc.kind);
    const catalog = hostFirst(mergeCatalog(paletteGroups(), contribution), contribution);
    const pieces = piecesGroup(session, doc.kind);
    return pieces ? [...catalog, pieces] : catalog;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, doc.kind, session, version]);

  const results = useMemo<Ranked[] | null>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    const ranked: Ranked[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        const value = score(item, needle);
        if (value >= 0) ranked.push({ item, group: group.label, score: value });
      }
    }
    return ranked.sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label));
  }, [groups, query]);

  /** Build the node this row inserts, with fresh globally-unique ids. */
  const build = useCallback(
    (item: PaletteItem): Node => {
      const raw = item.make();
      return stampTree(host.onInsert?.(raw) ?? raw, host.makeId ?? defaultMakeId);
    },
    [host]
  );

  /**
   * Where a CLICKED row lands.
   *
   * Beside the selection, not inside it — except when the selection is an empty
   * container, which is the one case where "inside" is unambiguously what the
   * author meant. Nothing selected appends to the end of the document, which is
   * where someone building a page from the top down is working.
   */
  const insert = useCallback(
    (item: PaletteItem) => {
      const node = build(item);
      if (!isAddressable(node) || !node.id) return;

      const selected = selection[0];
      const place = selected ? findPlace(doc.root, selected) : undefined;

      let parentId = isAddressable(doc.root) ? doc.root.id : undefined;
      let index = (doc.root.kind === 'outlet' ? [] : (doc.root.children ?? [])).length;

      if (place) {
        const target = place.node;
        const canHold =
          target.kind === 'element' &&
          !VOID_TAGS.has(target.tag.toLowerCase()) &&
          !target.instanceOf;
        if (canHold && !(target.children ?? []).length) {
          parentId = target.id;
          index = 0;
        } else if (place.parent?.id) {
          parentId = place.parent.id;
          index = place.index + 1;
        }
      }

      // A refusal has to be SPOKEN. Some places genuinely cannot hold what is being
      // added — inside a saved piece, inside an image — and a click that silently
      // does nothing teaches an author that Insert is broken rather than that the
      // spot is wrong.
      const done =
        parentId &&
        apply(`Add ${item.label.toLowerCase()}`, [{ kind: 'node.insert', parentId, index, node }]);
      if (!done) {
        toast.add({
          title: `“${item.label}” can’t go there`,
          description:
            'Pick a different spot on the page — a section or a container — and try again.',
          type: 'info',
        });
        return;
      }
      // Tell the pane something landed. On a narrow screen the palette and the
      // canvas are different SCREENS, so without this an author tapped Heading,
      // the node was added and selected out of sight, and the only feedback was
      // the rail they were already looking at.
      onInserted?.();
      select([node.id]);
    },
    [apply, build, doc.root, selection, select, onInserted, toast]
  );

  // Per document, not per kind: two builders dock side by side, and a block
  // dragged from one palette must not draw a drop indicator on the other's page.
  const surface = docKey(doc);

  const rows =
    results ??
    groups.flatMap((group) => group.items.map((item) => ({ item, group: group.label, score: 0 })));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-base-300 border-b p-2">
        <Input
          size="sm"
          value={query}
          placeholder="Search for something to add"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {results ? (
          <PaletteRows rows={rows} onInsert={insert} onBuild={build} surface={surface} showGroup />
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-4">
              <h3 className="text-base-content mb-1 px-1 text-sm font-medium">{group.label}</h3>
              <PaletteRows
                rows={group.items.map((item) => ({ item, group: group.label, score: 0 }))}
                onInsert={insert}
                onBuild={build}
                surface={surface}
              />
            </section>
          ))
        )}
        {results?.length === 0 ? (
          <p className="text-base-content px-1 py-6 text-sm">
            Nothing matches “{query}”. Try a plainer word — “photo”, “button”, “prices”.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A key that survives the flattening.
 *
 * An item's `key` is unique inside its own group, and browsing renders one list
 * per group, so it holds there. SEARCH does not: it flattens every group into a
 * single list, and two different things can legitimately share a name — there is
 * a `timeline` in Data (a bare component) and a `timeline` in How it works (a
 * composed section). React saw one key twice, warned, and is free to drop one of
 * the rows, so a search could silently omit the entry somebody went looking for.
 * Pairing the group with the key makes it unique in both shapes at once.
 */
export function rowKey(group: string | undefined, item: PaletteItem): string {
  return `${group ?? ''}:${item.key}`;
}

function PaletteRows({
  rows,
  onInsert,
  onBuild,
  surface,
  showGroup,
}: {
  rows: Ranked[];
  onInsert: (item: PaletteItem) => void;
  onBuild: (item: PaletteItem) => Node;
  surface: string;
  showGroup?: boolean;
}) {
  return (
    <ul>
      {rows.map(({ item, group }) => (
        <PaletteRow
          key={rowKey(group, item)}
          item={item}
          group={showGroup ? group : undefined}
          surface={surface}
          onInsert={onInsert}
          onBuild={onBuild}
        />
      ))}
    </ul>
  );
}

/** One row: a button, a mouse drag source, and a press-and-hold drag source. */
function PaletteRow({
  item,
  group,
  surface,
  onInsert,
  onBuild,
}: {
  item: PaletteItem;
  group?: string;
  surface: string;
  onInsert: (item: PaletteItem) => void;
  onBuild: (item: PaletteItem) => Node;
}) {
  // Built at PRESS time, not at render: every insert needs its own ids, and a node
  // minted once per render would place the same id twice on one page.
  const dragSource = useDragSource(() => ({ surface, node: onBuild(item) }));

  return (
    <li>
      <button
        type="button"
        draggable
        onClick={() => onInsert(item)}
        onDragStart={(event) => {
          // The canvas decodes this into a real insert at the exact drop spot.
          event.dataTransfer.setData(NODE_DRAG_TYPE, JSON.stringify(onBuild(item)));
          event.dataTransfer.effectAllowed = 'copy';
        }}
        {...dragSource}
        className="hover:bg-base-200 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left"
      >
        <StudioIcon name={item.icon} className="text-base-content/70 inline-flex size-4 shrink-0" />
        {/* The name gets the WHOLE row. A search result used to carry its group in
            a second column on the same line, and on a rail this narrow that column
            cost about half the width: searching "opening" returned three rows
            reading "Opening (wor…", "Opening ho…" and "Opening over a f…" — cut at
            exactly the point where they start to differ, so the list could not be
            used to choose between them. The group is still worth saying, because it
            is what tells "Opening hours" from "Opening (words only)"; it just
            belongs on the second line, where it is short and leads the sentence. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{item.label}</span>
          {group || item.hint ? (
            <span className="text-base-content block truncate text-xs">
              {[group, item.hint].filter(Boolean).join(' · ')}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  );
}
