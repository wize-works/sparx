'use client';

// Every way you file content — "Categories", "Tags", and any of your own.
//
// A short, bounded list — a business has a handful of these, not hundreds — so
// it loads whole and filters in the browser. It renders as a table, like the
// content and redirects lists, because every entry carries the same few facts
// (its name, its machine key, whether it nests, how many labels it holds) and
// people scan DOWN a column — "which of these nests", "which one is biggest".
//
// The vocabulary's name leads each row; its reference, nesting and label count
// are notes about it, and the less-important of those give way on a narrow pane.
//
// The three note columns are worded to match the EDITOR one click away, because
// they are the same three facts and a person reads them minutes apart. It used
// to say "Key" over a bare `blog_category` in monospace, "Structure" over the
// word "Flat", and "Terms" over a number — three pieces of vocabulary a shop
// owner has no use for, on a screen whose own detail pane already calls them
// "Reference", "Allow nesting" and "the individual labels inside this" and
// explains each one (issue 385).

import { useMemo, useState } from 'react';
import { PaneLoadError } from '../../components/pane-load-error';
import { PaneWaiting } from '../../components/pane-waiting';
import { Badge, Button, Card, SearchInput } from '@wizeworks/silicaui-react';
import { Table } from '../../components/table';
import { faPlus, faTags } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { taxonomyKind, useTaxonomies, type Taxonomy } from './taxonomy-data';
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

export function TaxonomyListSurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useTaxonomies();
  const [search, setSearch] = useState('');

  const all = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.plural_name.localeCompare(b.plural_name)),
    [data]
  );

  const needle = search.trim().toLowerCase();
  const matches = needle
    ? all.filter(
        (taxonomy) =>
          taxonomy.name.toLowerCase().includes(needle) ||
          taxonomy.plural_name.toLowerCase().includes(needle) ||
          taxonomy.key.toLowerCase().includes(needle)
      )
    : all;

  const open = (taxonomy: Taxonomy, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.taxonomy.detail', { key: taxonomy.key }, { target: targetFor(event) });
  };

  const create = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.taxonomy.detail', { key: 'new' }, { target: targetFor(event) });
  };

  if (isError) {
    return (
      <Card className="min-h-0 flex-1 items-center justify-center">
        <PaneLoadError
          icon={<Icon glyph={faTags} className="size-6" aria-hidden />}
          title="Could not load your tags and topics"
          description="This is a problem reaching the server. None of your labels are affected."
          onRetry={() => {
            void refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Tags and topics list controls"
        search={
          /* The width sits on a WRAPPER: SearchInput forwards className to its
            inner <input>, so a class aimed at the control never reaches the
            element that lays out. */
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search tags and topics"
              placeholder="Search…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="hidden shrink-0 text-sm whitespace-nowrap @xl:block">
            {needle
              ? `${String(matches.length)} of ${String(all.length)}`
              : all.length === 1
                ? '1 way to file'
                : `${String(all.length)} ways to file`}
          </p>
        }
        primaryAction={{
          label: 'New',
          icon: faPlus,
          onClick: create,
          title: 'Add a way to file content — hold Shift to open alongside, Alt for a new window',
        }}
        views={{
          target: '/cms/taxonomy',
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
        {isPending ? (
          <PaneWaiting />
        ) : matches.length === 0 ? (
          <ListEmptyState
            module={MODULE}
            filtered={Boolean(needle)}
            noResults={{
              icon: <Icon glyph={faTags} className="size-6" aria-hidden />,
              title: 'Nothing matches that',
              description: 'Try part of the name — or clear the search to see them all.',
            }}
            firstRun={{
              title: 'No ways to file content yet',
              description:
                'A way to file content — like Categories or Tags — lets readers find everything you have written on one subject. Add your first one to get started.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    create({ shiftKey: false, altKey: false });
                  }}
                >
                  <Icon glyph={faPlus} className="size-4" aria-hidden />
                  Add one
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Name</th>
                <th
                  className="hidden @xl:table-cell"
                  title="The code that connects this to your content. You never have to type it."
                >
                  Reference
                </th>
                <th className="hidden @2xl:table-cell">Nesting</th>
                <th className="text-right">Labels</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((taxonomy) => {
                const kind = taxonomyKind(taxonomy.hierarchical);
                return (
                  <tr
                    key={taxonomy.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(taxonomy, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(taxonomy, event);
                    }}
                  >
                    <td>
                      <span className="block max-w-72 truncate font-medium">
                        {taxonomy.plural_name}
                      </span>
                    </td>
                    <td className="hidden max-w-56 truncate font-mono text-sm @xl:table-cell">
                      {taxonomy.key}
                    </td>
                    <td className="hidden @2xl:table-cell">
                      {/* A badge only for the notable case. "Plain list" is the
                          ordinary one and reads better as words than as a second
                          pill competing for the eye (RULE #4). */}
                      {kind ? (
                        <Badge color="info" variant="soft" size="sm" title={kind.detail}>
                          {kind.label}
                        </Badge>
                      ) : (
                        <span className="text-sm">Plain list</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">
                      {taxonomy.term_count.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <RowOpenHint />
    </div>
  );
}
