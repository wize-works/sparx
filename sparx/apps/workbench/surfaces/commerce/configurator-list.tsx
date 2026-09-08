'use client';

// The configurator (build-to-order templates) list — catalog-wide.
//
// A template belongs to a product and turns it into something a shopper builds
// to order. This list is the whole catalog of them in one place; each row leads
// with the template's name, says which product it is for and how many questions
// it asks, and whether shoppers are being asked them right now.
//
// A standard workbench list: a real <Table> whose headers sort SERVER-SIDE (a
// client-side sort of one loaded page would sort that page and pass it off as
// the whole answer), server-paged via <ListPagination>, columns disclosed with
// @container so the same table reads in a narrow docked pane or a full window.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Plus, Settings2 } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import type { Tone } from './products-data';
import { useConfiguratorTemplates, type SortDir, type TemplateSort } from './configurator-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function statusBadge(status: string): { label: string; tone: Tone } {
  if (status === 'active') return { label: 'Live', tone: 'success' };
  if (status === 'archived') return { label: 'Retired', tone: 'neutral' };
  return { label: 'Not live', tone: 'info' };
}

export function ConfiguratorListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  // Alphabetical by name is the readable default for a catalog list, and it puts
  // the sort indicator on the column people scan by.
  const [sort, setSort] = useState<{ key: TemplateSort; dir: SortDir }>({
    key: 'name',
    dir: 'asc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isError, isFetching, dataUpdatedAt, refetch } = useConfiguratorTemplates(
    {
      q: search,
      ...(status !== 'all' ? { status } : {}),
      sortBy: sort.key,
      order: sort.dir,
      take,
      skip,
    }
  );

  const rows = data?.items ?? [];
  const total = data?.total;
  const anyFilter = search.trim() !== '' || status !== 'all';

  /** Anything that changes which rows match returns to the first window. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: TemplateSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Text ascends; the question count descends (the busiest builds first).
          { key, dir: key === 'options' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const header = (key: TemplateSort, label: string, extra = '') => (
    <th
      className={extra}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        onClick={() => {
          toggleSort(key);
        }}
      >
        {label}
        {sort.key === key ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.configurator-template.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Configurator list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search builds"
              placeholder="Search builds…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            title="Set up a build — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open(
                'commerce.configurator-template.detail',
                { id: 'new' },
                { target: targetFor(event) }
              );
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Set up a build</span>
          </Button>
        }
        controls={
          <>
            <div className="hidden w-36 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Show which builds"
                value={status}
                items={{
                  all: 'All builds',
                  active: 'Live',
                  draft: 'Not live',
                  archived: 'Retired',
                }}
                onValueChange={(next) => {
                  setStatus(next as string);
                  resetWindow();
                }}
              />
            </div>
          </>
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
            title="Could not load your builds"
            description="Something went wrong reaching the server. It may be temporary — try again in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={anyFilter}
            noResults={{
              icon: <Settings2 className="size-6" aria-hidden />,
              title: 'Nothing matches those filters',
              description: 'Try a different word, or clear the filters to see everything.',
            }}
            firstRun={{
              title: 'No builds yet',
              description:
                'A build lets a shopper make a product to order — choosing a size, a finish, an engraving, anything that changes what they get or what it costs. Set up your first one to get started.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('name', 'Build')}
                {header('product', 'For product', 'hidden @lg:table-cell')}
                {header('options', 'Questions', 'hidden text-right @xl:table-cell')}
                {header('status', 'Status')}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = statusBadge(row.status);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(row.id, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(row.id, event);
                    }}
                  >
                    <td className="max-w-56 truncate font-medium">{row.name}</td>
                    <td className="hidden max-w-48 truncate text-sm @lg:table-cell">
                      {row.productTitle}
                    </td>
                    <td className="hidden text-right tabular-nums @xl:table-cell">
                      {row.optionCount === 1
                        ? '1 question'
                        : `${String(row.optionCount)} questions`}
                    </td>
                    <td>
                      <Badge color={badge.tone} variant="soft" size="sm">
                        {badge.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        <RowOpenHint />
      </div>
    </div>
  );
}
