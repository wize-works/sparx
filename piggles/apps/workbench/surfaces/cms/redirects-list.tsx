'use client';

// Redirects — the old-link-to-new-link rules for this site.
//
// SEARCH IS CLIENT-SIDE, unlike the content list, because the redirects endpoint
// offers no text query. That is only honest while the whole set is loaded, so
// this pane pulls one generous window (the server's 250 ceiling) rather than
// paging — a redirect table is a bounded configuration set, not a feed — and
// says so plainly if a site somehow runs past it.

import { useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  SearchInput,
  Text,
} from '@wizeworks/silicaui-react';
import { faPlus, faUpRight, faUpload } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneLoadError } from '../../components/pane-load-error';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { AddRedirectDialog } from './redirects-add-dialog';
import { RedirectsTable } from './redirects-table';
import { useRedirects, type Redirect } from './redirects-data';
import { TYPE_FILTERS, useFilteredRedirects, type TypeFilterValue } from './redirects-filter';
import { useRemoveRedirect } from './redirects-remove';

/** Brand artwork for the empty state; and the server's single-request ceiling,
 *  which a config table sits well within. */
const MODULE = 'cms';
const WINDOW = 250;

export function RedirectsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const { onDelete, removingId, busy: removing } = useRemoveRedirect();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>('all');
  const [adding, setAdding] = useState(false);
  // The rule the dialog is changing. Undefined means it is adding a new one — the
  // same dialog, because the fields and the wording are the same question.
  const [editing, setEditing] = useState<Redirect | undefined>(undefined);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useRedirects({
    take: WINDOW,
    skip: 0,
  });

  const rows = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total;
  const overWindow = typeof total === 'number' && total > rows.length;
  const staleAfterFailure = Boolean(error) && rows.length > 0;

  const { filtered, narrowed } = useFilteredRedirects(rows, search, typeFilter);

  const openImport = (event: { shiftKey: boolean; altKey: boolean }) => {
    // Beside, not on top of, the list: keeping the existing rules in view while
    // pasting new ones is how someone avoids importing a duplicate.
    ctx.open('cms.redirects.import', {}, { target: event.altKey ? 'window' : 'beside' });
  };

  const onOpen = (row: Redirect) => {
    setEditing(row);
    setAdding(true);
  };

  /**
   * The way out of a duplicate refusal.
   *
   * She typed an address that is already caught, so the rule she collided with
   * is the rule she wants. Found in the rows already loaded rather than fetched:
   * the refusal can only have come from a rule the list is showing, and asking
   * the server again would put a spinner between her and the thing she just
   * asked for.
   */
  const onOpenExisting = (fromPath: string) => {
    const existing = rows.find((row) => row.from_path === fromPath);
    if (existing) setEditing(existing);
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Redirects list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search redirects"
              placeholder="Old or new address…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primaryAction={{
          label: 'Add redirect',
          icon: faPlus,
          onClick: () => {
            setAdding(true);
          },
        }}
        filters={[
          {
            label: 'Show',
            key: 'type',
            value: typeFilter,
            neutralValue: 'all',
            options: TYPE_FILTERS.map((entry) => ({ value: entry.value, label: entry.label })),
            onValueChange: (next) => {
              setTypeFilter(next as TypeFilterValue);
            },
          },
        ]}
        actions={[
          {
            label: 'Bulk import',
            icon: faUpload,
            onClick: openImport,
            title: 'Import a list of redirects — hold Alt to open in a new window',
          },
        ]}
        views={{
          target: '/cms/redirects',
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

      {overWindow ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>Showing the first {rows.length} redirects</AlertTitle>
            <AlertDescription>
              This site has {total} in total — more than this pane loads at once. Search and filter
              cover the ones shown here.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {staleAfterFailure ? (
          <Alert color="warning" className="m-2">
            <AlertContent>
              <AlertTitle>Could not check for changes just now</AlertTitle>
              <AlertDescription>
                This is a problem reaching the server. What you see below is what loaded last, and
                may be out of date.
              </AlertDescription>
            </AlertContent>
            <Button
              size="sm"
              color="warning"
              variant="soft"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          </Alert>
        ) : null}

        {error && !staleAfterFailure ? (
          <PaneLoadError
            icon={<Icon glyph={faUpRight} className="size-6" aria-hidden />}
            title="Could not load your redirects"
            description="This is a problem reaching the server. None of your redirects have been lost — they are still sending visitors on as before."
            onRetry={() => {
              void refetch();
            }}
          />
        ) : isLoading ? (
          <PaneWaiting />
        ) : filtered.length === 0 ? (
          <ListEmptyState
            module={MODULE}
            filtered={narrowed}
            noResults={{
              icon: <Icon glyph={faUpRight} className="size-6" aria-hidden />,
              title: 'Nothing matches that',
              description:
                'No redirect matches what you searched or filtered for. Try part of an address, or switch the filter back to All.',
            }}
            firstRun={{
              title: 'No redirects yet',
              description:
                'When you move or rename a page, a redirect sends anyone using the old address to the new one instead of a dead end. Add your first one, or import a whole list at once.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    setAdding(true);
                  }}
                >
                  <Icon glyph={faPlus} className="size-4" aria-hidden />
                  Add a redirect
                </Button>
              ),
            }}
          />
        ) : (
          <RedirectsTable
            rows={filtered}
            onOpen={onOpen}
            onDelete={onDelete}
            removingId={removingId}
            busy={removing}
          />
        )}
      </Card>

      <Text className="shrink-0 px-1 text-sm">
        {filtered.length === rows.length
          ? `${rows.length} ${rows.length === 1 ? 'redirect' : 'redirects'}`
          : `${filtered.length} of ${rows.length} shown`}
      </Text>

      <AddRedirectDialog
        open={adding}
        editing={editing}
        onOpenChange={(next) => {
          setAdding(next);
          if (!next) setEditing(undefined);
        }}
        onOpenExisting={onOpenExisting}
      />
    </div>
  );
}
