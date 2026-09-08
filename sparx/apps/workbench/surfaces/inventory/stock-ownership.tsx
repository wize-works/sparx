'use client';

// WHOSE STOCK IS THIS — the goods in your building that are not your asset.
//
// Every inventory system starts from the assumption that stock on your shelf is
// yours. For most businesses that is true and this screen is empty, which is the
// correct outcome and is what its empty state says.
//
// For the rest it is false in the dangerous direction. A shop holding a
// supplier's consignment, a workshop holding a fleet operator's own parts, a
// business whose warehouse partner owns the buffer — all of them are counting
// somebody else's goods as their own inventory value, and that overstatement
// survives right up until an accountant asks for the schedule.
//
// ── One thing changes, and only one ───────────────────────────────────────
//
// Ownership decides whether the units count toward VALUATION. It does NOT change
// availability: consigned stock is sellable, because being able to sell it is
// the entire reason to hold it. The asymmetry is the feature, and the screen
// says so out loud — otherwise the first thing somebody does is set a level to
// "consignment" expecting it to disappear from the storefront.

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
} from '@wizeworks/silicaui-react';
import { Handshake, PackageSearch } from 'lucide-react';
import { useState } from 'react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural } from './data';
import { ownershipLabel, ownershipTone, useNonOwnedStock } from './demand-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function StockOwnershipSurface({ ctx }: { ctx: SurfaceContext }) {
  const [ownership, setOwnership] = useState('');
  const list = useNonOwnedStock(ownership ? { ownership } : {});

  const rows = list.data?.items ?? [];
  const totalValueCents = list.data?.totalValueCents ?? 0;
  const uncosted = rows.filter((r) => r.valueCents === null).length;

  const open = (variantId: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.stock.item', { variantId }, { target: targetFor(event) });
  };

  const body = () => {
    if (list.isError) {
      return (
        <EmptyState
          icon={<PackageSearch className="size-6" aria-hidden />}
          title="Could not load ownership"
          description="This is a problem reaching the server, not a finding about your stock. Try again in a moment."
        />
      );
    }
    if (list.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Checking whose stock is whose…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<Handshake className="size-6" aria-hidden />}
          title="Everything on your shelves is yours"
          description="Nothing is marked as consignment, customer-owned, or belonging to a warehouse partner. Set it on an item's stock screen when you start holding goods you have not bought."
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Item</th>
            <th>Whose</th>
            <th className="hidden @lg:table-cell">Owner</th>
            <th className="text-right whitespace-nowrap">On hand</th>
            <th className="text-right whitespace-nowrap">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.variantId}:${row.warehouseId}`}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                open(row.variantId, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(row.variantId, event);
              }}
            >
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {row.variantName ?? row.variantSku ?? 'Unnamed item'}
                    {row.variantSku && row.variantName ? (
                      <span className="ml-1.5 font-mono text-sm">{row.variantSku}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-sm">
                    {row.warehouseName ?? 'Unknown location'}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap">
                <Badge color={ownershipTone(row.ownership)} variant="soft" size="sm">
                  {ownershipLabel(row.ownership)}
                </Badge>
              </td>
              <td className="hidden max-w-[14rem] truncate @lg:table-cell">
                {/* Named, or conspicuously not. Consigned stock with no owner is
                    a debt to nobody, and settlement will refuse it later — better
                    to see the gap here. */}
                {row.ownerSupplierName ?? row.ownerCustomerName ?? (
                  <Text className="text-sm">nobody named</Text>
                )}
              </td>
              <td className="text-right tabular-nums">{row.onHand}</td>
              <td className="text-right tabular-nums">
                {row.valueCents === null ? (
                  <Text className="text-sm">not costed</Text>
                ) : (
                  formatCents(row.valueCents)
                )}
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
        label="Ownership controls"
        status={
          <Text className="text-sm">
            {rows.length === 0
              ? 'Nothing to show'
              : `${formatCents(totalValueCents)} across ${plural(rows.length, 'line', 'lines')}`}
          </Text>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-52 shrink"
              aria-label="Which ownership"
              value={ownership}
              onChange={(event) => {
                setOwnership(event.target.value);
              }}
            >
              <option value="">Everything that is not yours</option>
              <option value="consignment">On consignment</option>
              <option value="customer_owned">A customer’s</option>
              <option value="3pl_owned">Your warehouse partner’s</option>
              <option value="owned">Yours</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={list.isFetching}
            updatedAt={list.data ? list.dataUpdatedAt : undefined}
            onRefresh={() => {
              void list.refetch();
            }}
          />
        }
      />

      {rows.length > 0 ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>This stock is still on sale</AlertTitle>
            <AlertDescription>
              Marking goods as somebody else’s takes them OUT of your inventory value and leaves
              them fully sellable — which is the whole point of holding consignment. To stop
              something being sold, move it to a shelf that is not for sale instead.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      {uncosted > 0 ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>{plural(uncosted, 'line has', 'lines have')} no cost recorded</AlertTitle>
            <AlertDescription>
              Their value is shown as blank rather than as nothing, because a zero here would say
              the owner gave them to you. Settlement will refuse to close a period containing them —
              put a cost on those items first.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>
    </div>
  );
}
