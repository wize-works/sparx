'use client';

// The kinds of content this business can create — and the doorway to defining new
// ones.
//
// This is a SMALL, bounded set: the platform built-ins plus the handful a business
// defines for itself. So unlike the Content list (hundreds of entries, server-paged)
// everything loads at once and the search and the filter run in the browser.
//
// A table, matching every other workbench list: each type is the same few facts
// (what it is, its id, how many entries already use it, whether it's one-of-a-kind
// or a view-only built-in) and people scan DOWN those columns. The one meaningful
// split — "the ones you made" vs "the shared built-in ones you can't change" — is
// carried by two consecutive tables under plain headings, not an invented column.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  SearchInput,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { Database, Plus } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useContentTypeList, useEntryCountsByType, type ContentType } from './content-types-data';
import { RowOpenHint } from '../../components/row-open-hint';

const KIND_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Yours' },
  { value: 'built_in', label: 'Built-in' },
] as const;

type KindFilterValue = (typeof KIND_FILTERS)[number]['value'];

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function usageLabel(count: number | undefined): string {
  if (count === undefined) return '';
  if (count === 0) return 'No entries yet';
  return `${String(count)} ${count === 1 ? 'entry' : 'entries'}`;
}

export function ContentTypesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilterValue>('all');

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useContentTypeList();
  // Counts are a nice-to-have overlay: if they fail, the list still works, so this
  // never blocks or errors the surface.
  const { data: counts } = useEntryCountsByType();

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((type) => {
      if (kind === 'custom' && type.is_built_in) return false;
      if (kind === 'built_in' && !type.is_built_in) return false;
      if (needle) {
        const haystack =
          `${type.name} ${type.plural_name} ${type.key} ${type.description ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [data, kind, needle]);

  const custom = filtered.filter((type) => !type.is_built_in);
  const builtIn = filtered.filter((type) => type.is_built_in);
  const narrowed = kind !== 'all' || needle !== '';

  const open = (type: ContentType, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.types.detail', { key: type.key }, { target: targetFor(event) });
  };

  const create = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.types.detail', { key: 'new' }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Content type list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search content types"
              placeholder="Name or id…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Define a new kind of content — hold Shift to open alongside, Alt for a new window"
            onClick={create}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @2xl:inline">New type</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={kind}
              onValueChange={(next) => {
                setKind((next as KindFilterValue | null) ?? 'all');
              }}
              showReset={false}
              aria-label="Filter by kind"
            >
              {KIND_FILTERS.map((entry) => (
                <FilterItem key={entry.value} value={entry.value}>
                  {entry.label}
                </FilterItem>
              ))}
            </Filter>
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          // A failed load REPLACES the list — a false "nothing here" over a
          // connection failure is the worst thing to say about a schema.
          <Card className="flex-1">
            <EmptyState
              icon={<Database className="size-6" aria-hidden />}
              title="Could not load your content types"
              description="This is a problem reaching the server. Nothing you have defined is affected."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          </Card>
        ) : isLoading ? (
          <Card className="flex-1">
            <p className="p-4 text-sm" role="status">
              Loading…
            </p>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex-1">
            <ListEmptyState
              filtered={narrowed}
              noResults={{
                icon: <Database className="size-6" aria-hidden />,
                title: 'Nothing matches that',
                description: 'Try a different search, or switch the filter back to All.',
              }}
              firstRun={{
                title: 'No content types yet',
                description:
                  'Define your first kind of content — a recipe, a case study, a job listing — with exactly the fields it needs.',
                actions: (
                  <Button
                    size="sm"
                    color="module"
                    onClick={() => {
                      create({ shiftKey: false, altKey: false });
                    }}
                  >
                    <Plus className="size-4" aria-hidden />
                    New type
                  </Button>
                ),
              }}
            />
          </Card>
        ) : (
          <div className="flex w-full flex-col gap-6">
            <TypeGroup
              title="Your types"
              description="The kinds of content you defined. Open one to change its fields."
              types={custom}
              counts={counts}
              emptyHint={
                kind === 'built_in'
                  ? null
                  : 'You have not defined any of your own yet. Use “New type” above to make one.'
              }
              onOpen={open}
            />
            <TypeGroup
              title="Built-in types"
              description="Shared types that come with sparx. You can look at how they are built, but they cannot be changed or removed."
              types={builtIn}
              counts={counts}
              emptyHint={null}
              onOpen={open}
            />
          </div>
        )}
      </div>

      <RowOpenHint />
    </div>
  );
}

/* ── One group of types ─────────────────────────────────────────────────── */

interface TypeGroupProps {
  title: string;
  description: string;
  types: ContentType[];
  counts: Map<string, number> | undefined;
  /** Shown instead of the rows when the group is empty; null hides the group. */
  emptyHint: string | null;
  onOpen: (type: ContentType, event: { shiftKey: boolean; altKey: boolean }) => void;
}

function TypeGroup({ title, description, types, counts, emptyHint, onOpen }: TypeGroupProps) {
  if (types.length === 0 && emptyHint === null) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <Heading level={2} className="text-lg font-semibold">
          {title}
        </Heading>
        <Text className="text-sm">{description}</Text>
      </div>

      {types.length === 0 ? (
        <Text className="px-1 text-sm">{emptyHint}</Text>
      ) : (
        <Table size="sm" hover>
          <thead>
            <tr>
              <th>Name</th>
              <th className="hidden @xl:table-cell">Key</th>
              <th className="hidden @2xl:table-cell">Entries</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const count = counts?.get(type.key);
              const usage = usageLabel(count);
              return (
                <tr
                  key={type.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    onOpen(type, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onOpen(type, event);
                  }}
                >
                  <td>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{type.name}</span>
                      {type.is_singleton ? (
                        <Badge color="info" variant="soft" size="sm">
                          Only one
                        </Badge>
                      ) : null}
                      {type.is_built_in ? (
                        <Badge color="info" variant="soft" size="sm">
                          View only
                        </Badge>
                      ) : null}
                    </span>
                    {type.description ? (
                      <span className="mt-0.5 block max-w-96 truncate text-sm">
                        {type.description}
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden font-mono text-sm @xl:table-cell">{type.key}</td>
                  <td className="hidden text-sm whitespace-nowrap @2xl:table-cell">{usage}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </section>
  );
}
