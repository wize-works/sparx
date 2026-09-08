'use client';

// Will the expanded bar still fit in two rows here?
//
// A fixed width cannot answer that: the same 780px pane holds Stock's bar on one
// row and pushes Content's onto a third. But measuring the RENDERED bar is the
// oscillation trap — collapsing removes the very content that caused it, so the
// bar fits, so it expands, forever.
//
// This measures each control's NATURAL width while the bar is expanded, caches
// those, and decides from the cache. Two properties make it safe: the cache is
// only ever written while expanded, and row count falls monotonically as the
// pane widens — so the decision crosses once and settles.

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { TOOLBAR_COLLAPSE_PX } from './use-narrow-container';

/** Two rows is a bar with more than a row's worth. A third is a paragraph. */
const MAX_ROWS = 2;

interface Metrics {
  widths: number[];
  gap: number;
  padding: number;
}

/** Every flex item of the bar — a `contents` wrapper hands its children up. */
function itemsOf(bar: HTMLElement): HTMLElement[] {
  return [...bar.children].flatMap((child) =>
    getComputedStyle(child).display === 'contents'
      ? ([...child.children] as HTMLElement[])
      : [child as HTMLElement]
  );
}

/** What each control ASKS for: its own width, or its floor if it may give. */
function measure(bar: HTMLElement): Metrics {
  const style = getComputedStyle(bar);
  return {
    widths: itemsOf(bar).map((item) => {
      const own = getComputedStyle(item);
      const floor = Number.parseFloat(own.minWidth);
      const gives = Number.parseFloat(own.flexGrow) > 0 && floor > 0;
      return Math.ceil(gives ? floor : item.getBoundingClientRect().width);
    }),
    gap: Number.parseFloat(style.columnGap) || 0,
    padding:
      (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0),
  };
}

/** How many rows those controls take at this width — flexbox's own line-breaking. */
function rowsAt(metrics: Metrics, width: number): number {
  const room = width - metrics.padding;
  let rows = 1;
  let used = 0;
  for (const item of metrics.widths) {
    const next = used === 0 ? item : used + metrics.gap + item;
    if (next > room && used > 0) {
      rows += 1;
      used = item;
    } else {
      used = next;
    }
  }
  return rows;
}

/** The pane's own width, which its CONTENTS can never change. */
function useObservedWidth(
  ref: RefObject<HTMLElement | null>,
  onWidth: (next: number) => void
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === 'number' && next > 0) onWidth(Math.round(next));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
    // `onWidth` is a setState — stable for the element's lifetime.
  }, [ref, onWidth]);
}

/** What the bar is holding, typed structurally so `lib` never imports a component. */
export interface ToolbarSlots {
  filters?: readonly { key?: string; label: string; options: readonly unknown[] }[];
  actions?: readonly { label: string }[];
  controls?: unknown;
  views?: unknown;
  refresh?: unknown;
  primary?: unknown;
  hasLink: boolean;
}

/** The INVENTORY as data — how a folded bar learns its cached measurement is stale. */
function signatureOf(slots: ToolbarSlots): string {
  return [
    slots.filters?.map((f) => `${f.key ?? f.label}:${String(f.options.length)}`).join(),
    slots.actions?.map((a) => a.label).join(),
    [slots.controls, slots.views, slots.refresh, slots.primary, slots.hasLink].map(Boolean).join(),
  ].join('|');
}

/** Nothing to fold means no trigger: an empty popover is worse than no button. */
function foldableOf(slots: ToolbarSlots): boolean {
  const groups = (slots.filters?.length ?? 0) + (slots.actions?.length ?? 0);
  return (
    groups > 0 ||
    Boolean(slots.controls) ||
    Boolean(slots.refresh) ||
    Boolean(slots.views) ||
    slots.hasLink
  );
}

/**
 * Whether this toolbar has to fold its controls away, and whether the pane is
 * narrow enough that a label cannot be afforded either.
 */
export function useToolbarFit(
  ref: RefObject<HTMLElement | null>,
  slots: ToolbarSlots
): { narrow: boolean; collapsed: boolean } {
  const signature = signatureOf(slots);
  const foldable = foldableOf(slots);
  // Starts 0, like `useNarrowContainer` starts wide: the first paint has no
  // measurement, and guessing "narrow" flashes a folded bar onto every pane.
  const [width, setWidth] = useState(0);
  const [crowded, setCrowded] = useState(false);
  const metrics = useRef<Metrics | null>(null);
  const collapsedNow = useRef(false);
  const lastSignature = useRef(signature);

  if (lastSignature.current !== signature) {
    lastSignature.current = signature;
    metrics.current = null;
  }

  const narrow = width > 0 && width < TOOLBAR_COLLAPSE_PX;
  const collapsed = foldable && (narrow || crowded);
  collapsedNow.current = collapsed;

  useObservedWidth(ref, setWidth);

  useLayoutEffect(() => {
    const bar = ref.current?.firstElementChild;
    if (!(bar instanceof HTMLElement) || width === 0) return;
    // Only ever while expanded. Measuring a folded bar would read the content
    // that is left after folding, which is exactly the trap this avoids.
    if (!collapsedNow.current) metrics.current = measure(bar);
    const current = metrics.current;
    setCrowded(current !== null && rowsAt(current, width) > MAX_ROWS);
  });

  return { narrow, collapsed };
}
