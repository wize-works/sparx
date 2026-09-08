'use client';

// The launcher — how anything gets opened, and how anything gets found.
//
// It answers two questions in one box. "Where is X" is NAVIGATION: a flat
// catalog of surfaces (registry.ts), filtered locally as you type — typing "inv"
// and pressing Enter beats three clicks down a tree. "Which X" is RECORD SEARCH:
// a live query against the platform's Typesense index (lib/api/search.ts) that
// finds the actual order, customer, product, or deal by name. Surfaces sort
// first (you usually know the screen you want); matching records follow, grouped
// by kind.
//
// The modifier keys are the other half of the story, and they are what make this
// a workbench rather than a launcher: Enter opens a tab, ⇧Enter opens it
// alongside what you're looking at, ⌥Enter tears it into its own window. That
// contract is identical for a surface and a record — the destination is stated
// at the moment you ask for it, whichever kind of thing you asked for.
//
// Three neighbours carry the parts: what rows exist (launcher-entries.ts), what
// counts as a match (launcher-match.ts), and what a row looks like
// (launcher-rows.tsx). This file owns the dialog, the query and the keyboard.
//
// This is a purpose-built async palette (composed from the silica Dialog +
// SearchInput + Kbd primitives) rather than silica's <CommandPalette>, which
// owns its input internally and can only ever filter a static list — it has no
// seam to feed live server results through. Brandon approved the composition.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dialog, DialogContent, DialogTitle, Kbd, SearchInput } from '@wizeworks/silicaui-react';
import { useNavEntries, useRecordEntries } from './launcher-entries';
import { rankEntries, rankRecords, type Entry } from './launcher-match';
import { groupEntries, LauncherEmpty, LauncherGroup, RecordSearchNote } from './launcher-rows';

export function Launcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const navEntries = useNavEntries();
  const { entries: recordEntries, searching } = useRecordEntries(query, open);

  // Bind ⌘K / Ctrl+K here — silica's <CommandPalette> used to own this, and it
  // left with it. Only one Launcher is mounted at a time (the compact shell
  // returns before the dock renders), so there's no double-toggle.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Each fresh open starts clean — an old query lingering behind the backdrop
  // reads as stale, and the highlight must return to the top.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // Surfaces filter locally on the live query; records arrive already filtered.
  // Empty query is the launcher's resting state: navigation only, no records.
  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navEntries;
    // BOTH halves ranked. Surfaces were; records arrived in the search server's
    // order and were appended untouched, so its typo tolerance decided what the
    // highlight — and therefore Enter — landed on. Typing "Priya" put Privacy
    // Policy first with three customers called Priya below it; typing
    // "Marguerite" put the text of a review above the woman who wrote it.
    return [...rankEntries(navEntries, q), ...rankRecords(recordEntries, q)];
  }, [query, navEntries, recordEntries]);

  // Keep the highlight in range as the list shrinks/grows under it.
  useEffect(() => {
    setActiveIndex((i) => (i >= entries.length ? 0 : i));
  }, [entries.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, entries]);

  const groups = useMemo(() => groupEntries(entries), [entries]);

  const move = (dir: 1 | -1) => {
    const n = entries.length;
    if (n === 0) return;
    setActiveIndex((i) => (i + dir + n) % n);
  };

  const select = (index: number, mods: { shiftKey?: boolean; altKey?: boolean }) => {
    const entry = entries[index];
    if (!entry) return;
    entry.run(mods);
    onOpenChange(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(activeIndex, { shiftKey: e.shiftKey, altKey: e.altKey });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A FIXED height, not a maximum. Silica's dialog popup is centered by
          `top: 50%` plus a `translate(-50%, -50%)`, so its height and its top
          edge are the same number: everything in it shifts up by half of
          whatever the panel grows. This panel changes height three times in one
          search — it opens tall on the whole navigation list, collapses to the
          few surfaces that match what was typed, then grows again when the
          record results land a beat later. An owner reading the list, aiming at
          a row and clicking it got a different row: aiming at "Saved pieces"
          opened a blog post, because the records arrived between the eye and the
          finger (issue 414). Pinning the height pins the top edge, so the panel
          opens in one place and stays there for the whole interaction — which
          costs nothing, because the resting list already fills it. */}
      <DialogContent className="flex h-[70dvh] w-full max-w-xl flex-col overflow-hidden p-0">
        <DialogTitle className="sr-only">Search everything</DialogTitle>

        {/* The keydown handler rides the search field itself — arrows move the
            highlight, Enter opens with the held modifier — exactly where the
            typing already is. The Dialog moves focus here on open (first
            focusable), so no autofocus prop is needed. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-base-300 border-b p-3">
            <SearchInput
              size="md"
              value={query}
              onValueChange={setQuery}
              onKeyDown={onKeyDown}
              aria-label="Search everything"
              placeholder="Search for anything — orders, customers, products…"
            />
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
            {entries.length === 0 ? (
              <LauncherEmpty searching={searching} typed={query.trim().length > 0} />
            ) : (
              groups.map((group) => (
                <LauncherGroup
                  key={group.group}
                  group={group}
                  activeIndex={activeIndex}
                  onHover={setActiveIndex}
                  onSelect={select}
                />
              ))
            )}
          </div>

          {/* The record half's own result — see RecordSearchNote. Outside the
              scrolling list, because it is a statement ABOUT the list rather
              than a row in it, and it must not scroll out of sight. */}
          <RecordSearchNote searching={searching} found={recordEntries.length} query={query} />

          {/* The modifier contract, spelled out — the same three destinations for
              a surface and a record. */}
          <div className="border-base-300 flex items-center gap-4 border-t px-3 py-2 text-xs">
            <span className="flex items-center gap-1">
              <Kbd size="sm">↵</Kbd> open
            </span>
            <span className="flex items-center gap-1">
              <Kbd size="sm">⇧↵</Kbd> alongside
            </span>
            <span className="flex items-center gap-1">
              <Kbd size="sm">⌥↵</Kbd> new window
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
