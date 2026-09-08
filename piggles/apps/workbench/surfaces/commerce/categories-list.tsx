'use client';

// The categories list — the whole tree, every level openable.
//
// A category is a nested thing ("Outdoor › Camping › Cookware"), and the generic
// list factory would only show the ROOTS (the tree endpoint returns nested
// nodes, and a flat list renders the top of it). That hides every sub-category
// from the one screen meant to manage them, so this list is hand-written: it
// FLATTENS the tree and shows each category as its full trail, so a person can
// reach and open any of them.
//
// It is rendered as a <Table> for visual consistency with the other commerce
// lists — but UNLIKE them it does NOT server-page or server-sort, and that is
// deliberate, not an oversight. The categories endpoint returns the COMPLETE
// tree in one response (parent pickers depend on that), so there is no paged
// window that a client-side sort could misrepresent: filtering and sorting the
// whole set in the browser is the correct, honest thing here. Hence no
// <ListPagination>, and every column sort keeps each row's full trail so the
// hierarchy stays legible however it is ordered.

import { useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { Card, EmptyState, SearchInput } from '@wizeworks/silicaui-react';
import { faPlus, faTags } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { flattenCategories, useCategoryTree, type CategoryChoice } from './categories-data';
import { CategoriesTable, type CatSortKey, type Sort } from './categories-list-table';
import { RowOpenHint } from '../../components/row-open-hint';

/** Registry module for this surface, so the brand's empty-state artwork is this
 *  app's own picture rather than the generic one. */
const MODULE = 'commerce';

// Sorting is CLIENT-SIDE over the full tree (see the file header). `null` is the
// natural tree order — depth-first, parents before children — which is the
// meaningful default and cannot be expressed as a single column. The keys live
// with the table that renders the headers.

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CategoriesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort | null>(null);
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useCategoryTree();

  const all = useMemo(() => flattenCategories(data), [data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle === '') return all;
    return all.filter((category) => category.trail.join(' › ').toLowerCase().includes(needle));
  }, [all, search]);

  // Sorting a COPY, never the flatten in place. With no active sort the rows keep
  // their natural tree order. Sorting the Category column orders by the full
  // trail string, so siblings stay together and every row still reads as its
  // whole path.
  const rows = useMemo(() => {
    if (!sort) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const cmp =
        sort.key === 'name'
          ? a.trail.join(' › ').localeCompare(b.trail.join(' › '))
          : a.productCount - b.productCount;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort]);

  const toggleSort = (key: CatSortKey) => {
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'productCount' ? 'desc' : 'asc' }
    );
  };

  const open = (category: CategoryChoice, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.category.detail', { id: category.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Category list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search categories"
              placeholder="Search categories…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primaryAction={{
          label: 'Add a category',
          icon: faPlus,
          onClick: (event) => {
            ctx.open('commerce.category.detail', { id: 'new' }, { target: targetFor(event) });
          },
          title: 'Add a category — hold Shift to open alongside, Alt for a new window',
        }}
        views={{
          target: '/commerce/categories',
          params: { q: search.trim(), sort: sort ? `${sort.key}:${sort.dir}` : '' },
          onApply: (next) => {
            setSearch(next.q ?? '');
            const [key, dir] = (next.sort ?? '').split(':');
            // No stored sort means the natural tree order, which is this list's
            // neutral — not "keep whatever was on".
            setSort(
              key && (dir === 'asc' || dir === 'desc') ? { key: key as CatSortKey, dir } : null
            );
          },
        }}
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            title="Could not load your categories"
            description="Something went wrong reaching the server. It may be temporary — try again in a moment."
          />
        ) : isPending ? (
          <PaneWaiting />
        ) : rows.length === 0 ? (
          <ListEmptyState
            module={MODULE}
            filtered={Boolean(search)}
            noResults={{
              icon: <Icon glyph={faTags} className="size-6" aria-hidden />,
              title: 'Nothing matches that search',
              description: 'Try a different word, or clear the search box to see everything.',
            }}
            firstRun={{
              title: 'No categories yet',
              description:
                'Categories are the aisles of your website menu — the structure shoppers browse down. Add your first one to get started.',
            }}
          />
        ) : (
          <CategoriesTable rows={rows} sort={sort} onToggleSort={toggleSort} onOpen={open} />
        )}
      </Card>

      <RowOpenHint />
    </div>
  );
}
