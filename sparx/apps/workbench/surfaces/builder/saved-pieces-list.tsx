'use client';

// The pieces of your pages you built once and reuse everywhere.
//
// NOT a table. A saved piece is a one-line thing — a name and what it's for — and
// the set is small and naturally sorted into a few kinds. A table would want a
// header row per kind and would invent columns to justify itself. So each kind is
// a card and each piece a row inside it: the name as the content, and a tag on
// the right ONLY when the piece goes somewhere unusual. (This is the domains-list
// pattern, for the same reasons.)
//
// There is no "New" here on purpose: a saved piece is BORN in the editor — you
// build something, select it, and save it as a piece — so the create path is
// "Open the editor", and the empty state says exactly that.
//
// Filtering is client-side: the endpoint returns the whole (small) library in one
// call and takes no query, so paging or server search would be machinery with
// nothing to do.

import { useMemo, useState } from 'react';
import { Badge, Button, Heading, SearchInput, Text } from '@wizeworks/silicaui-react';
import { Component, Pencil } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  PIECE_GROUP_ORDER,
  groupMeta,
  surfaceScopeTag,
  useSavedPieces,
  type PieceGroup,
  type PieceSummary,
} from './saved-pieces-data';
import { RowOpenHint } from '../../components/row-open-hint';
import { PaneLoadError } from '../../components/pane-load-error';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function PieceRow({
  piece,
  onOpen,
}: {
  piece: PieceSummary;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const scope = surfaceScopeTag(piece.surfaces);
  return (
    <li className="border-base-300 hover:bg-base-200 border-b last:border-b-0">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
        onClick={onOpen}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {/* The name is the content of the row — everything else is a note about
              it, so nothing else gets to be the same size. */}
          <span className="truncate text-base font-medium">{piece.name}</span>
          {piece.description ? <span className="truncate text-sm">{piece.description}</span> : null}
        </div>
        {scope ? (
          <Badge color="module" variant="soft" size="sm" className="shrink-0">
            {scope}
          </Badge>
        ) : null}
      </button>
    </li>
  );
}

export function SavedPiecesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data: pieces, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSavedPieces();
  const [search, setSearch] = useState('');

  const all = useMemo(() => pieces ?? [], [pieces]);
  const needle = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return all;
    return all.filter(
      (piece) =>
        piece.name.toLowerCase().includes(needle) ||
        piece.key.toLowerCase().includes(needle) ||
        (piece.description ?? '').toLowerCase().includes(needle)
    );
  }, [all, needle]);

  // Grouped by kind in a fixed reading order, empty kinds dropped. A tenant with
  // everything in one kind still reads fine as a single card.
  const groups = useMemo(() => {
    const byGroup = new Map<PieceGroup, PieceSummary[]>();
    for (const piece of matches) {
      const list = byGroup.get(piece.group) ?? [];
      list.push(piece);
      byGroup.set(piece.group, list);
    }
    for (const list of byGroup.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return PIECE_GROUP_ORDER.map((group) => ({ group, rows: byGroup.get(group) ?? [] })).filter(
      (entry) => entry.rows.length > 0
    );
  }, [matches]);

  const open = (piece: PieceSummary, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('builder.component', { key: piece.key }, { target: targetFor(event) });
  };

  const openEditor = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('builder.studio', undefined, { target: targetFor(event) });
  };

  if (isError) {
    return (
      <PaneLoadError
        icon={<Component className="size-6" aria-hidden />}
        title="Could not load your saved pieces"
        description="This is a problem reaching the server. None of your pieces are affected — nothing has been lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className={PANE_SHELL}>
      {/* No primary "New" — pieces are made in the editor — so the right-hand
          group is "Open the editor" then refresh, and the count gives way first
          as the pane narrows. This bar does not wrap. */}
      <PaneToolbar
        label="Saved pieces list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search saved pieces"
              placeholder="Search pieces…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="hidden shrink-0 text-sm whitespace-nowrap @xl:block">
            {needle
              ? `${String(matches.length)} of ${String(all.length)}`
              : all.length === 1
                ? '1 piece'
                : `${String(all.length)} pieces`}
          </p>
        }
        primary={
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Open the editor — hold Shift to open alongside, Alt for a new window"
            onClick={openEditor}
          >
            <Pencil className="size-4" aria-hidden />
            <span className="hidden @2xl:inline">Open the editor</span>
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={pieces ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <p className="text-sm" role="status">
            Loading…
          </p>
        ) : groups.length === 0 ? (
          <ListEmptyState
            filtered={Boolean(needle)}
            noResults={{
              icon: <Component className="size-6" aria-hidden />,
              title: 'No pieces match that',
              description:
                'Try part of the name or what it is for — or clear the search to see them all.',
            }}
            firstRun={{
              title: 'No saved pieces yet',
              description:
                'A saved piece is a part of a page you build once and reuse. Open the editor, build something, select it, and choose “Save as a piece” — it then shows up here, and dropping it onto a page keeps it in step everywhere.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    openEditor({ shiftKey: false, altKey: false });
                  }}
                >
                  <Pencil className="size-4" aria-hidden />
                  Open the editor
                </Button>
              ),
            }}
          />
        ) : (
          // Capped and centred: a pane torn onto a second monitor is otherwise
          // 2000px wide with the tags a foot away from their names.
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {groups.map(({ group, rows }) => {
              const meta = groupMeta(group);
              return (
                <section key={group} className="card bg-base-100 overflow-hidden">
                  <header className="border-base-300 flex flex-col gap-0.5 border-b px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Heading level={2} className="text-base font-semibold">
                        {meta.label}
                      </Heading>
                      <div className="flex-1" />
                      <Text className="text-sm">
                        {rows.length === 1 ? '1 piece' : `${String(rows.length)} pieces`}
                      </Text>
                    </div>
                    <Text className="text-sm">{meta.description}</Text>
                  </header>
                  <ul>
                    {rows.map((piece) => (
                      <PieceRow
                        key={piece.key}
                        piece={piece}
                        onOpen={(event) => {
                          open(piece, event);
                        }}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <RowOpenHint what="a piece to manage it" />
    </div>
  );
}
