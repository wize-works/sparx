'use client';

// Record types — what kinds of things this business keeps track of.
//
// The four sparx ships (customers, companies, deals, requests) and anything the
// business invented. Opening one is how you add the extra details you track:
// "warranty expires" on a customer, "competitor" on a deal.
//
// Deliberately NOT called "objects" or "schemas" anywhere a person can see. The
// business owner adding a field to their customers is not modelling data, they
// are writing down something they already keep on a sticky note.

import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Table } from '@wizeworks/silicaui-react';
import { Boxes, Plus } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { isModuleDisabled, useObjectTypes, type CrmObjectType } from './object-types-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function ObjectTypesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [showArchived, setShowArchived] = useState(false);
  const { data, error, isPending, isError, isFetching, dataUpdatedAt, refetch } = useObjectTypes({
    includeArchived: showArchived,
  });

  const rows = data?.items ?? [];
  const moduleOff = isModuleDisabled(error);

  const open = (type: CrmObjectType, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.object-type.detail', { key: type.key }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Record type controls"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            title="New record type — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.object-type.detail', { key: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New record type
          </Button>
        }
        controls={
          <>
            <Button
              size="sm"
              color="neutral"
              variant={showArchived ? 'solid' : 'outline'}
              onClick={() => {
                setShowArchived((v) => !v);
              }}
            >
              {showArchived ? 'Hiding nothing' : 'Show put-away types'}
            </Button>
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
        {moduleOff ? (
          <EmptyState
            icon={<Boxes className="size-6" aria-hidden />}
            title="Turn on Customers to see your record types"
            description="Record types appear once the customers module is switched on. They are the kinds of things you keep track of — customers, companies, deals — and the extra details you record on each."
          />
        ) : isError ? (
          <EmptyState
            icon={<Boxes className="size-6" aria-hidden />}
            title="Could not load your record types"
            description="Something went wrong reaching the server. It may be a temporary problem — try again in a moment."
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
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          // With `list` self-healing the built-ins, an empty list means the
          // "put away" filter hid everything — never "you have nothing."
          <EmptyState
            icon={<Boxes className="size-6" aria-hidden />}
            title="Nothing to show with this filter"
            description="Every record type you have is put away. Switch the filter above to see them."
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Record type</th>
                <th>Kind</th>
                <th className="text-right">Extra details</th>
                <th className="hidden @lg:table-cell">What it is</th>
                <th className="text-right">
                  <span className="sr-only">Open its records</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const count = row.propertySchema?.fields?.length ?? 0;
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(row, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(row, event);
                    }}
                  >
                    <td className="font-medium">
                      {row.labelPlural}
                      {row.archivedAt ? (
                        <Badge color="neutral" variant="soft" size="sm" className="ml-2">
                          Put away
                        </Badge>
                      ) : null}
                    </td>
                    <td>
                      {/* Built-in vs yours is a real distinction — one can be
                          extended, the other can also be put away — so it wears
                          a real color rather than a grey chip. */}
                      <Badge
                        color={row.kind === 'builtin' ? 'info' : 'module'}
                        variant="soft"
                        size="sm"
                      >
                        {row.kind === 'builtin' ? 'Comes with sparx' : 'Yours'}
                      </Badge>
                    </td>
                    <td className="text-right font-mono text-sm tabular-nums">
                      {count === 0 ? '—' : count}
                    </td>
                    <td className="hidden text-sm @lg:table-cell">{row.description ?? '—'}</td>
                    <td className="text-right">
                      {row.kind === 'custom' && !row.archivedAt ? (
                        <Button
                          color="module"
                          variant="soft"
                          size="sm"
                          aria-label={`Open the ${row.labelPlural.toLowerCase()}`}
                          title="Open these records"
                          onClick={(event) => {
                            // Stop the row's own click — this opens the ROWS, the
                            // row opens the TYPE, and landing on the wrong one is
                            // the sort of thing somebody stops trusting a table for.
                            event.stopPropagation();
                            ctx.open(
                              'crm.records.list',
                              { objectKey: row.key },
                              { target: targetFor(event) }
                            );
                          }}
                        >
                          Open
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="flex shrink-0 items-center justify-between px-1">
        <RowOpenHint what="one to add the extra details you track" className="px-0" />
      </div>
    </div>
  );
}
