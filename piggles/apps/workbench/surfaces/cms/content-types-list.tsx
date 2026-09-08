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
import { PaneWaiting } from '../../components/pane-waiting';
import { Button, Card, EmptyState, SearchInput } from '@wizeworks/silicaui-react';
import { faDatabase, faPlus } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useContentTypeList, useEntryCountsByType, type ContentType } from './content-types-data';
import { TypeGroup } from './content-types-list-table';
import { productCopy } from '../../lib/product';
import { RowOpenHint } from '../../components/row-open-hint';

/** Registry module for this surface, so the brand's empty-state artwork is this
 *  app's own picture rather than the generic one. */
const MODULE = 'cms';

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
        primaryAction={{
          label: 'New type',
          icon: faPlus,
          onClick: create,
          title:
            'Define a new kind of content — hold Shift to open alongside, Alt for a new window',
        }}
        filters={[
          {
            label: 'Kind',
            value: kind,
            onValueChange: (next) => {
              setKind((next as KindFilterValue | null) ?? 'all');
            },
            options: KIND_FILTERS,
          },
        ]}
        views={{
          target: '/cms/types',
          params: { q: search },
          onApply: (next) => {
            setSearch(next.q ?? '');
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          // A failed load REPLACES the list — a false "nothing here" over a
          // connection failure is the worst thing to say about a schema.
          <Card className="flex-1">
            <EmptyState
              icon={<Icon glyph={faDatabase} className="size-6" aria-hidden />}
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
            <PaneWaiting />
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex-1">
            <ListEmptyState
              module={MODULE}
              filtered={narrowed}
              noResults={{
                icon: <Icon glyph={faDatabase} className="size-6" aria-hidden />,
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
                    <Icon glyph={faPlus} className="size-4" aria-hidden />
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
              description={productCopy(
                'cms.contentTypes.builtIn',
                'Shared types that come with Piggles. You can look at how they are built, but they cannot be changed or removed.'
              )}
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
