'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ListToolbar as UiListToolbar,
  type ListToolbarOption,
  type ListToolbarView,
} from '@sparx/ui';
import { usePreferences } from './preferences-provider';

// URL-sync wrapper around the presentational `@sparx/ui` ListToolbar (docs/34
// §7.1). It owns all Next-router knowledge: every control writes its value into
// the query string (search debounced, the rest immediately) via
// `router.replace`, and the server page re-reads `searchParams` and refetches —
// so filtering is live with no client data layer and no "Apply" button.
//
// The Table/Cards toggle reads `?view=` falling back to the user's
// `defaultListView` preference (§7.2); the toggle writes an explicit `?view=`
// override for the current view only (never persisted per-list).

export interface ListToolbarFilterConfig {
  key: string;
  label: string;
  options: ListToolbarOption[];
}

export interface ListToolbarProps {
  /** Query key for the search box. Default `q`. */
  searchKey?: string;
  searchPlaceholder?: string;
  filters?: ListToolbarFilterConfig[];
  /** Query key the sort select writes. Default `sort_by`. */
  sortKey?: string;
  sortOptions?: ListToolbarOption[];
  /** Show the Table/Cards toggle. Default false. */
  enableViewToggle?: boolean;
  /** Query key the view toggle writes. Default `view`. */
  viewKey?: string;
  /** Search debounce in ms. Default 250. */
  debounceMs?: number;
}

export function ListToolbar({
  searchKey = 'q',
  searchPlaceholder = 'Search…',
  filters = [],
  sortKey = 'sort_by',
  sortOptions,
  enableViewToggle = false,
  viewKey = 'view',
  debounceMs = 250,
}: ListToolbarProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const prefs = usePreferences();

  const urlSearch = searchParams?.get(searchKey) ?? '';
  const [search, setSearch] = React.useState(urlSearch);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local search in sync if the URL changes from elsewhere (e.g. back/fwd
  // or a chip clearing a different filter resets the param set).
  React.useEffect(() => {
    setSearch(urlSearch);
  }, [urlSearch]);

  const commit = React.useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // Any filter/search/sort change resets pagination.
      next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  function onSearchChange(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit({ [searchKey]: value }), debounceMs);
  }

  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const view: ListToolbarView =
    (searchParams?.get(viewKey) as ListToolbarView | null) ?? prefs.defaultListView;

  return (
    <UiListToolbar
      searchValue={search}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      filters={filters.map((f) => ({ ...f, value: searchParams?.get(f.key) ?? '' }))}
      onFilterChange={(key, value) => commit({ [key]: value })}
      sort={
        sortOptions
          ? {
              options: sortOptions,
              value: searchParams?.get(sortKey) ?? sortOptions[0]?.value ?? '',
            }
          : undefined
      }
      onSortChange={(value) => commit({ [sortKey]: value })}
      view={enableViewToggle ? view : undefined}
      onViewChange={(v) => commit({ [viewKey]: v })}
    />
  );
}
