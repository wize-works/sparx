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
import { Badge, Button, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Plus, Tags } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { flattenCategories, useCategoryTree, type CategoryChoice } from './categories-data';
import { RowOpenHint } from '../../components/row-open-hint';

// Sorting is CLIENT-SIDE over the full tree (see the file header). `null` is the
// natural tree order — depth-first, parents before children — which is the
// meaningful default and cannot be expressed as a single column.
type CatSortKey = 'name' | 'productCount';
type SortDir = 'asc' | 'desc';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CategoriesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: CatSortKey; dir: SortDir } | null>(null);
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

  const header = (key: CatSortKey, label: string, extra = '') => (
    <th
      className={extra}
      aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        onClick={() => {
          toggleSort(key);
        }}
      >
        {label}
        {sort?.key === key ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );

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
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            title="Add a category — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('commerce.category.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Add a category</span>
          </Button>
        }
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
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={Boolean(search)}
            noResults={{
              icon: <Tags className="size-6" aria-hidden />,
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
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('name', 'Category')}
                <th className="hidden @lg:table-cell">Featured</th>
                {header('productCount', 'Products', 'text-right')}
              </tr>
            </thead>
            <tbody>
              {rows.map((category) => (
                <tr
                  key={category.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    open(category, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open(category, event);
                  }}
                >
                  <td>
                    <span className="min-w-0">
                      {category.trail.slice(0, -1).map((ancestor, index) => (
                        <span key={`${category.id}:${String(index)}`}>{ancestor} › </span>
                      ))}
                      <span className="font-semibold">{category.name}</span>
                    </span>
                  </td>
                  <td className="hidden @lg:table-cell">
                    {category.featured ? (
                      <Badge color="warning" variant="soft" size="sm">
                        Featured
                      </Badge>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums">{String(category.productCount)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <RowOpenHint />
    </div>
  );
}
