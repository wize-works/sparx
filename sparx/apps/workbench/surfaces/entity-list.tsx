'use client';

// A reusable list surface.
//
// Most list surfaces differ only in endpoint, columns, and what a row opens —
// so they're declared as data in the catalog rather than written out each time.
// That keeps behaviour (search, loading, empty, error, modifier-click, keyboard
// activation, a11y) identical everywhere by construction instead of by review.

import { useState, type ReactNode } from 'react';
import { useQuery } from '@wizeworks/query';
import { Badge, Button, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { Plus, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api/client';
import type { OpenTarget, SurfaceContext } from '../lib/surfaces/registry';
import { RefreshButton } from '../components/refresh-button';
import { PaneToolbar, PANE_SHELL } from '../components/pane-toolbar';
import { ListEmptyState } from '../components/list-empty-state';
import { RowOpenHint } from '../components/row-open-hint';

export interface ListColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Tabular figures + monospace — for ids, numbers, and money. */
  numeric?: boolean;
}

export interface EntityListConfig<T> {
  /** api-rest path, e.g. `/v1/commerce/products`. */
  path: string;
  /** Query-key root. Mutations elsewhere invalidate on this. */
  queryKey: string[];
  columns: ListColumn<T>[];
  /** Stable row id, used as the React key and passed to the detail surface. */
  rowId: (row: T) => string;
  /** Surface opened when a row is activated. Omit for read-only lists. */
  detailSurface?: string;
  /** Surface opened by the New button. Omit to hide it. */
  createSurface?: string;
  createLabel?: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyBody: string;
  emptyIcon?: LucideIcon;
}

/** Modifier held at activation decides placement — same contract as the launcher. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function createEntityListSurface<T>(config: EntityListConfig<T>) {
  function EntityListSurface({ ctx }: { ctx: SurfaceContext }) {
    const [search, setSearch] = useState('');

    const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useQuery({
      queryKey: [...config.queryKey, { q: search }],
      // api-rest's paged() puts the array in `data`; the client unwraps to it.
      queryFn: () => api.get<T[]>(config.path, { ...(search ? { q: search } : {}), take: 50 }),
    });

    const rows = data ?? [];
    const Icon = config.emptyIcon;

    const open = (row: T, event: { shiftKey: boolean; altKey: boolean }) => {
      if (!config.detailSurface) return;
      ctx.open(config.detailSurface, { id: config.rowId(row) }, { target: targetFor(event) });
    };

    return (
      // Surfaces, not one slab: the pane is base-200 and the toolbar and list are
      // base-100 cards lifted onto it. Every list in the app wears this, so the
      // generic factory has to as well — a factory that produced the ODD ONE OUT
      // would quietly make every list built on it inconsistent with the
      // hand-written ones.
      <div className={PANE_SHELL}>
        <PaneToolbar
          label="List controls"
          search={
            <div className="max-w-xs min-w-0 flex-1">
              <SearchInput
                size="sm"
                aria-label={config.searchPlaceholder}
                placeholder={config.searchPlaceholder}
                value={search}
                onValueChange={setSearch}
              />
            </div>
          }
          primary={
            config.createSurface ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto shrink-0 whitespace-nowrap"
                title={`${config.createLabel ?? 'New'} — hold Shift to open alongside, Alt for a new window`}
                onClick={(event) => {
                  ctx.open(config.createSurface!, { id: 'new' }, { target: targetFor(event) });
                }}
              >
                <Plus className="size-4" aria-hidden />
                {config.createLabel ?? 'New'}
              </Button>
            ) : undefined
          }
          refresh={
            <RefreshButton
              className={config.createSurface ? undefined : 'ml-auto'}
              isFetching={isFetching}
              updatedAt={data ? dataUpdatedAt : undefined}
              onRefresh={() => {
                void refetch();
              }}
            />
          }
        />

        <Card className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <EmptyState
              title="Could not load this list"
              description="Something went wrong reaching the server. It may be a temporary problem — try again in a moment."
            />
          ) : isLoading ? (
            // Full ink, not `/60`. This is text a person is meant to READ, and
            // fading it is reserved for text deliberately not meant to be read.
            <p className="p-4 text-sm" role="status">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <ListEmptyState
              filtered={Boolean(search)}
              noResults={{
                icon: Icon ? <Icon className="size-6" aria-hidden /> : undefined,
                title: 'Nothing matches that search',
                description: 'Try a different word, or clear the search box to see everything.',
              }}
              firstRun={{
                title: config.emptyTitle,
                description: config.emptyBody,
              }}
            />
          ) : (
            <Table size="sm" hover>
              <thead>
                <tr>
                  {config.columns.map((column) => (
                    <th key={column.key} className={column.align === 'right' ? 'text-right' : ''}>
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const interactive = Boolean(config.detailSurface);
                  return (
                    <tr
                      key={config.rowId(row)}
                      className={interactive ? 'cursor-pointer' : undefined}
                      // Rows are reachable and activatable by keyboard, not just
                      // mouse — a table of click-only rows is unusable without a
                      // pointer and fails WCAG 2.1.
                      tabIndex={interactive ? 0 : undefined}
                      role={interactive ? 'button' : undefined}
                      onClick={
                        interactive
                          ? (event) => {
                              open(row, event);
                            }
                          : undefined
                      }
                      onKeyDown={
                        interactive
                          ? (event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              open(row, event);
                            }
                          : undefined
                      }
                    >
                      {config.columns.map((column) => (
                        <td
                          key={column.key}
                          className={[
                            column.align === 'right' ? 'text-right' : '',
                            column.numeric ? 'font-mono text-sm tabular-nums' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {config.detailSurface ? (
          // Sits on the pane rather than in a docked strip, so no border — a rule
          // here would underline nothing. Full ink for the same reason as above.
          <RowOpenHint />
        ) : null}
      </div>
    );
  }

  return EntityListSurface;
}

/** Shared cell renderers, so money and status look identical across every list. */
export const cell = {
  money: (amount: number | null | undefined, currency = 'USD'): string =>
    amount === null || amount === undefined
      ? '—'
      : new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount),

  text: (value: string | null | undefined): string => value ?? '—',

  status: (
    value: string | null | undefined,
    tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'
  ): ReactNode =>
    value ? (
      <Badge color={tone} variant="soft" size="sm">
        {value}
      </Badge>
    ) : (
      '—'
    ),
};

export { Badge };
