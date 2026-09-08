'use client';

// The list for a tenant-invented object (docs/144 §3.6).
//
// ONE SURFACE FOR EVERY CUSTOM OBJECT. The pane's `objectKey` param says which
// one; everything on screen — the title, the columns, the empty state's wording,
// the button that adds a row — comes from the object definition. A business that
// invents "Project" gets a working list with no code written for them,
// which is the entire promise of the registry.
//
// THE COLUMNS ARE THE FIRST FOUR PROPERTIES, in the order the business declared
// them. That ordering is not arbitrary: the property editor is a list somebody
// dragged into the order that made sense to them, so the order they chose is the
// best available answer to "which of these matters most", and guessing by type
// would override a decision they already made.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Input, Table, Text } from '@wizeworks/silicaui-react';
import { Plus, Table2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { SavedViewsMenu, viewFilterValue, viewFilters } from './saved-views-menu';
import type { SavedView } from './workspace-data';
import { useObjectType } from './object-types-data';
import { cellText, recordErrorMessage, recordTitle, useRecords } from './records-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** Shift opens alongside, Alt pops out — the same modifier contract every other
 *  list in the workbench uses. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function RecordsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const objectKey = String(ctx.params.objectKey ?? '');
  const [q, setQ] = useState('');
  const [viewId, setViewId] = useState<string | null>(null);

  const type = useObjectType(objectKey);
  const records = useRecords(objectKey, { q });

  // Saved views are keyed by object, and a tenant's own object is an object —
  // so the record type somebody invented last week gets the same control as
  // Customers, with no code written for it. That is the registry's whole point,
  // and a capability that stopped at the built-in lists would quietly say
  // otherwise.
  const currentFilters = viewFilters([
    q.trim() !== '' && { field: `${objectKey}.search`, operator: 'contains', value: q.trim() },
  ]);

  const applyView = (view: SavedView | null): void => {
    setViewId(view?.id ?? null);
    setQ(viewFilterValue(view, `${objectKey}.search`));
  };

  useEffect(() => {
    ctx.setTitle(type.data?.labelPlural ?? 'Records');
  }, [ctx, type.data?.labelPlural]);

  // The first four declared properties, plus whatever the business nominated as
  // the title — which leads, because it is what a person scans by.
  const columns = useMemo(() => {
    const fields = type.data?.propertySchema?.fields ?? [];
    const primaryKey = type.data?.primaryFieldKey ?? null;
    const rest = fields.filter((f) => f.key !== primaryKey).slice(0, 3);
    return { primaryKey, rest };
  }, [type.data]);

  const rows = records.data?.items ?? [];
  const total = records.data?.total;
  const label = type.data?.label ?? 'record';
  const labelPlural = type.data?.labelPlural ?? 'records';
  const filtered = q.trim() !== '';

  const openRecord = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.record.detail', { id, objectKey }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${labelPlural} list controls`}
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            title={`Add a ${label.toLowerCase()} — hold Shift to open alongside, Alt for a new window`}
            onClick={(event) => {
              ctx.open('crm.record.detail', { id: 'new', objectKey }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add {label.toLowerCase()}
          </Button>
        }
        controls={
          <>
            <Table2 className="size-4 shrink-0" aria-hidden />
            <Input
              color="module"
              size="sm"
              className="max-w-64"
              aria-label={`Search ${labelPlural.toLowerCase()}`}
              placeholder={`Search ${labelPlural.toLowerCase()}`}
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
              }}
            />
            <SavedViewsMenu
              objectKey={objectKey}
              current={currentFilters}
              baseline={viewFilters([])}
              nameHint={`The ${labelPlural.toLowerCase()} I check`}
              selectedId={viewId}
              onApply={applyView}
            />
          </>
        }
        refresh={
          <RefreshButton
            isFetching={records.isFetching}
            updatedAt={records.data ? records.dataUpdatedAt : undefined}
            onRefresh={() => {
              void records.refetch();
            }}
          />
        }
      />

      {/* The same four branches, in the same order, as every other list in the
          workbench — error, loading, no rows, rows. A tenant's own record type
          is not a lesser surface than Customers, and an empty state that skips
          the shared component is exactly where it starts looking like one. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">
        {records.isError ? (
          <EmptyState
            icon={<Table2 className="size-6" aria-hidden />}
            title={`Could not load these ${labelPlural.toLowerCase()}`}
            description={recordErrorMessage(
              records.error,
              'Something went wrong reaching the server. It may be a temporary problem — try again in a moment.'
            )}
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  void records.refetch();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : records.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading&hellip;
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={filtered}
            noResults={{
              icon: <Table2 className="size-6" aria-hidden />,
              title: `No ${labelPlural.toLowerCase()} match that search`,
              description: 'Try a different word, or clear the search to see them all.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  variant="soft"
                  onClick={() => {
                    setQ('');
                  }}
                >
                  Clear the search
                </Button>
              ),
            }}
            firstRun={{
              // The tenant invented this type, so the welcome is about the thing
              // they invented — in their word for it, not "records".
              title: `No ${labelPlural.toLowerCase()} yet`,
              description: `You made this record type up, which means nobody else's software has it. Add the first ${label.toLowerCase()} and it will show here — with its own search, its own saved views, and a page of its own.`,
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={(event) => {
                    openRecord('new', event);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add the first {label.toLowerCase()}
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>{label}</th>
                {columns.rest.map((field) => (
                  <th key={field.key} className="hidden @md:table-cell">
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr
                  key={record.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    openRecord(record.id, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openRecord(record.id, event);
                  }}
                >
                  <td>
                    <Text as="span" className="font-medium">
                      {recordTitle(record, columns.primaryKey)}
                    </Text>
                  </td>
                  {columns.rest.map((field) => (
                    <td key={field.key} className="hidden @md:table-cell">
                      {cellText(record.values[field.key], field)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="flex shrink-0 items-center justify-between px-1">
        <RowOpenHint />
        {typeof total === 'number' && !records.isPending ? (
          <p className="text-xs">
            {filtered
              ? `${rows.length.toLocaleString()} shown`
              : `${total.toLocaleString()} in total`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
