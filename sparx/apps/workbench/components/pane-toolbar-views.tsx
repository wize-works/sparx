'use client';

// Saved views, declared as VALUES — the third slot to make that move, and the
// one where it pays best.
//
// A saved view is a snapshot of everything narrowing a list, so every surface
// that wanted one had to hand-build a params object, keep it in step with its
// own filter state, and write the inverse to apply one back. That is thirty
// lines of bookkeeping per list, and it is why the capability shipped on two
// lists out of a hundred.
//
// The toolbar already OWNS the filter values, so it can do that bookkeeping
// itself. What a surface still has to say is its identity and anything it filters
// by outside the `filters` slot — search text, a sort, a date range.

import { SavedViewsBar, columnsFromView, type ColumnOption } from './saved-views';
import { neutralOf, type ToolbarFilter } from './pane-toolbar-filters';
import type { ToolbarPresentation } from './toolbar-presentation';

export interface ToolbarViews {
  /**
   * The list's identity, DERIVED FROM ITS REGISTRY KEY: dots become slashes, a
   * trailing `.list` is dropped, and it leads with `/`. So
   * `commerce.products.list` → `/commerce/products`, `inventory.stock.list` →
   * `/inventory/stock`.
   *
   * A path rather than the raw key because the platform's seeded presets are
   * written as paths (api-rest `saved-view-presets.ts`) and a list only inherits
   * its starter views if the two agree. Derived from the key rather than invented
   * because the key is already unique and already promised never to change.
   *
   * PERSISTED on every saved view, so revising one orphans the lot.
   */
  target: string;
  /** Params beyond the `filters` groups — search text, sort, a date range. */
  params?: Record<string, string>;
  /** Apply the non-filter half of a view. Filter groups are applied for you. */
  onApply?: (params: Record<string, string>) => void;
  /** Every column the list CAN show. Omit unless the list already has a
   *  column-visibility concept — most do not. */
  columns?: ColumnOption[];
  visibleColumns?: string[];
  onColumnsChange?: (keys: string[]) => void;
}

/** A filter group's persisted param name. */
function keyOf(filter: ToolbarFilter): string {
  return filter.key ?? filter.label;
}

/** What the list is showing right now: the surface's own params, plus every
 *  filter group the bar is holding. */
function snapshot(views: ToolbarViews, filters: readonly ToolbarFilter[]): Record<string, string> {
  return {
    ...views.params,
    ...Object.fromEntries(filters.map((filter) => [keyOf(filter), filter.value])),
    // Written the same way SaveViewDialog writes it, so a view that stored
    // columns still compares equal to the list that produced it — otherwise it
    // would never show as the one you are looking at.
    ...(views.visibleColumns ? { columns: views.visibleColumns.join(',') } : {}),
  };
}

/**
 * Put a saved view back on the list.
 *
 * A missing key means NEUTRAL, not "leave it alone": empty values are dropped
 * when a view is saved, so a view that deliberately cleared a filter stores
 * nothing about it. Skipping absent keys would leave yesterday's filter on and
 * quietly answer a different question.
 */
function applySnapshot(
  views: ToolbarViews,
  filters: readonly ToolbarFilter[],
  next: Record<string, string>
) {
  const owned = new Set(filters.map(keyOf));
  for (const filter of filters) {
    filter.onValueChange(next[keyOf(filter)] ?? neutralOf(filter));
  }
  if (views.onColumnsChange && views.columns) {
    owned.add('columns');
    views.onColumnsChange(
      columnsFromView(
        next,
        views.columns.map((column) => column.key)
      )
    );
  }
  views.onApply?.(Object.fromEntries(Object.entries(next).filter(([key]) => !owned.has(key))));
}

interface ToolbarViewsControlProps {
  views: ToolbarViews;
  filters: readonly ToolbarFilter[];
  presentation?: ToolbarPresentation;
}

export function ToolbarViewsControl({
  views,
  filters,
  presentation = 'bar',
}: ToolbarViewsControlProps) {
  return (
    <SavedViewsBar
      target={views.target}
      params={snapshot(views, filters)}
      presentation={presentation}
      columns={views.columns}
      visibleColumns={views.visibleColumns}
      onColumnsChange={views.onColumnsChange}
      onApply={(next) => {
        applySnapshot(views, filters, next);
      }}
    />
  );
}
