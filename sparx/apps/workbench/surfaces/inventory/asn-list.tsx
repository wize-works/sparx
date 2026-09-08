'use client';

// ON THE WAY — what suppliers have told you they have shipped.
//
// A notice is a CLAIM, not stock. Nothing on this screen has arrived, nothing
// here is sellable, and nothing here has moved a single number in your stock
// figures. What it gives you is two days' warning and, when the pallet lands, a
// pre-filled delivery to check against instead of a blank form to type.
//
// ── The row that matters most is the one that never turned up ─────────────
//
// A notice that says the lorry left, whose date has passed, and which nothing
// has been received against, is the strongest signal in the whole buying
// section: the supplier believes they have shipped, and you do not have it. It
// gets its own color and sorts to the top of the default view.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  EmptyState,
  NativeSelect,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { PackageSearch, Truck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import {
  asnSourceLabel,
  asnStatusLabel,
  asnStatusTone,
  useAdvanceShipNotices,
  type AsnListQuery,
} from './advance-ship-notices-data';

type View = 'open' | 'overdue' | 'received' | 'all';

const VIEWS: Record<View, AsnListQuery> = {
  open: { status: 'expected' },
  overdue: { status: 'expected', overdueOnly: true },
  received: { status: 'received' },
  all: {},
};

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function AsnListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [view, setView] = useState<View>('open');

  const notices = useAdvanceShipNotices(VIEWS[view]);
  const rows = notices.data?.items ?? [];
  const overdue = rows.filter((row) => row.isOverdue).length;

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.advance-ship-notices.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (notices.isError) {
      return (
        <EmptyState
          icon={<PackageSearch className="size-6" aria-hidden />}
          title="Could not load what is on the way"
          description="This is a problem reaching the server, not a statement that nothing has shipped. Try again in a moment."
        />
      );
    }
    if (notices.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading what is on the way…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<Truck className="size-6" aria-hidden />}
          title={view === 'overdue' ? 'Nothing is missing' : 'Nothing on the way'}
          description={
            view === 'overdue'
              ? 'Every shipment a supplier told you about has either arrived or is still inside its date.'
              : 'When a supplier tells you what they have shipped — by email, on a file, or through their own system — record it against the order and it appears here. Receiving then pre-fills from it instead of being typed from scratch.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Shipment</th>
            <th className="whitespace-nowrap">State</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Expected</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">Units</th>
            <th className="hidden whitespace-nowrap @2xl:table-cell">Carrier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    <span className="font-mono">{row.number}</span>
                    {' · '}
                    {row.supplierName ?? 'Unnamed supplier'}
                  </span>
                  <span className="truncate text-sm">
                    against <span className="font-mono">{row.purchaseOrderNumber ?? '—'}</span>
                    {row.reference ? ` · their ref ${row.reference}` : ''}
                    {' · '}
                    {asnSourceLabel(row.source)}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={asnStatusTone(row)} variant="soft" size="sm">
                  {asnStatusLabel(row)}
                </Badge>
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                {row.expectedArrivalAt ? (
                  <Timestamp value={row.expectedArrivalAt} format="relative" />
                ) : (
                  <Text className="text-sm">No date given</Text>
                )}
              </td>
              <td className="hidden text-right tabular-nums @xl:table-cell">{row.unitsShipped}</td>
              <td className="hidden whitespace-nowrap @2xl:table-cell">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{row.carrier ?? '—'}</span>
                  {row.trackingNumber ? (
                    <span className="truncate font-mono text-sm">{row.trackingNumber}</span>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Inbound shipment controls"
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-48 shrink"
              aria-label="Show shipments that are"
              value={view}
              onChange={(event) => {
                setView(event.target.value as View);
              }}
            >
              <option value="open">On the way</option>
              <option value="overdue">Should have arrived</option>
              <option value="received">Arrived</option>
              <option value="all">Everything</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={notices.isFetching}
            updatedAt={notices.data ? notices.dataUpdatedAt : undefined}
            onRefresh={() => {
              void notices.refetch();
            }}
          />
        }
      />

      {overdue > 0 && view !== 'overdue' ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>
              {plural(overdue, 'shipment was', 'shipments were')} due and have not arrived
            </AlertTitle>
            <AlertDescription>
              The supplier believes they have sent these. Nothing has been booked in against them,
              so either they are stuck with the carrier or they never left.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>

      <Text className="text-sm">
        Nothing here counts as stock. A shipment becomes stock when somebody books the delivery in.
      </Text>
    </div>
  );
}
