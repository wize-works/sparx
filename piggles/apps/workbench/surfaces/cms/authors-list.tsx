'use client';

// The people whose names appear on what you publish.
//
// A table, like every other list page in the app: the author's face and name in
// the first cell, the web address in the second. The faces stay — they just live
// inside a row now — and people scan the names down the column.
//
// The list is small and bounded — a masthead is people, not records — so it
// loads in one window and filters in the browser, like the web-addresses list.

import { useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { Button, Card, SearchInput } from '@wizeworks/silicaui-react';
import { faPlus, faUser, faUserPlus } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneLoadError } from '../../components/pane-load-error';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
// Read-only import: resolves avatar asset ids to real thumbnail URLs, the same
// way the content editor's asset fields do.
import { useMediaAssets, type MediaAsset } from './media';
// Read-only import: how many sites the business runs, which is the only thing
// that decides whether a shared byline is worth marking as one.
import { useSites } from '../sites/data';
import { useAuthorsList, type Author } from './authors-data';
import { AuthorsTable } from './authors-list-table';
import { RowOpenHint } from '../../components/row-open-hint';

/** Registry module for this surface, so the brand's empty-state artwork is this
 *  app's own picture rather than the generic one. */
const MODULE = 'cms';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function AuthorsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');

  // A masthead is a bounded set of people, so one generous window covers it and
  // the search runs in the browser. `take: 250` is the API's ceiling.
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAuthorsList({
    take: 250,
    skip: 0,
  });

  const authors = useMemo(() => data?.items ?? [], [data]);

  // The list is already scoped to this site by the server; this only decides
  // whether "shared across all your sites" is a distinction worth printing.
  const { data: sites } = useSites();
  const multiSite = (sites ?? []).length > 1;

  // Every avatar in ONE request, so the list shows real faces rather than ids.
  const avatarIds = useMemo(
    () =>
      authors
        .map((author) => author.avatar_asset_id)
        .filter((id): id is string => typeof id === 'string'),
    [authors]
  );
  const { data: assets } = useMediaAssets(avatarIds);
  const assetById = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const asset of assets ?? []) map.set(asset.id, asset);
    return map;
  }, [assets]);

  const needle = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? authors.filter(
            (author) =>
              author.display_name.toLowerCase().includes(needle) ||
              author.slug.toLowerCase().includes(needle)
          )
        : authors,
    [authors, needle]
  );

  const open = (author: Author, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.authors.detail', { id: author.id }, { target: targetFor(event) });
  };

  const create = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.authors.detail', { id: 'new' }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      {/* Search, a count and the primary action fit one line; below @xl the count
          gives way first, since search is used constantly and the count is a
          glance. The bar does not wrap. */}
      <PaneToolbar
        label="Author list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search authors"
              placeholder="Search by name…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="hidden shrink-0 text-sm whitespace-nowrap @xl:block">
            {needle
              ? `${String(matches.length)} of ${String(authors.length)}`
              : authors.length === 1
                ? '1 author'
                : `${String(authors.length)} authors`}
          </p>
        }
        primaryAction={{
          label: 'New author',
          icon: faPlus,
          onClick: create,
          title: 'Add an author — hold Shift to open alongside, Alt for a new window',
        }}
        views={{
          target: '/cms/authors',
          params: { q: search },
          onApply: (next) => {
            setSearch(next.q ?? '');
          },
        }}
        refresh={
          /* ALWAYS the last child of a list toolbar — see RefreshButton. */
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
        {/* A failed load REPLACES the list — "no authors yet" over a connection
            failure is a lie about their work, and the worst one to tell. It
            replaces the list and NOT the pane: the toolbar above still searches,
            still counts, and still adds an author. */}
        {isError ? (
          <PaneLoadError
            icon={<Icon glyph={faUser} className="size-6" aria-hidden />}
            title="Could not load your authors"
            description="This is a problem reaching the server. None of your authors have been lost."
            onRetry={() => {
              void refetch();
            }}
          />
        ) : isPending ? (
          <PaneWaiting />
        ) : matches.length === 0 ? (
          <ListEmptyState
            module={MODULE}
            filtered={Boolean(needle)}
            noResults={{
              icon: <Icon glyph={faUserPlus} className="size-6" aria-hidden />,
              title: 'No authors match that',
              description: 'Try part of the name, or clear the search to see everyone.',
            }}
            firstRun={{
              title: 'No authors yet',
              description:
                'Authors are the names that appear on what you publish — a photo and a short biography each. Add your first one and you can pick it on any post.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    create({ shiftKey: false, altKey: false });
                  }}
                >
                  <Icon glyph={faPlus} className="size-4" aria-hidden />
                  Add an author
                </Button>
              ),
            }}
          />
        ) : (
          <AuthorsTable
            authors={matches}
            assetById={assetById}
            showShared={multiSite}
            onOpen={open}
          />
        )}
      </Card>

      <RowOpenHint what="an author to edit" />
    </div>
  );
}
