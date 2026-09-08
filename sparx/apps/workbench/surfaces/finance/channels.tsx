'use client';

// Where money comes from — takings split by where the sale happened.
//
// An analytical breakdown, not a chart tease: every channel carries its real
// figures (orders, sales value, refunds, money received) alongside a proportional
// bar, because an owner deciding where to spend attention needs the numbers, not
// just their shape. "Takings" is money actually received, so a channel that sells
// a lot but refunds a lot doesn't overstate itself.

import { useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  Progress,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { Store } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useChannels, type ChannelRow } from './channels-data';
import { channelLabel, formatMoney, formatMoneyCompact } from './format';

const RANGES = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '12 months' },
] as const;

function sharePct(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${String(Math.round((value / total) * 100))}%`;
}

export function ChannelsSurface(_props: { ctx: SurfaceContext }) {
  const [range, setRange] = useState('90');
  const days = Number(range);
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useChannels(days);

  const currency = data?.currency ?? 'USD';
  const rows: ChannelRow[] = data?.channels ?? [];
  const totals = data?.totals ?? { orders: 0, gross: 0, net: 0, refunds: 0 };
  const topNet = rows.reduce((m, r) => Math.max(m, r.net), 0);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Channel breakdown controls"
        controls={
          <>
            <Filter
              color="module"
              value={range}
              onValueChange={(next) => {
                setRange(next ?? '90');
              }}
              showReset={false}
              aria-label="Time range"
            >
              {RANGES.map((r) => (
                <FilterItem key={r.value} value={r.value}>
                  {r.label}
                </FilterItem>
              ))}
            </Filter>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<Store className="size-6" aria-hidden />}
            title="Could not load your channels"
            description="Something went wrong reaching the server. Try again in a moment."
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
          <EmptyState
            icon={<Store className="size-6" aria-hidden />}
            title="No sales in this period"
            description="Nothing was sold in the range you picked. Try a longer period, or come back once orders start coming in."
          />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Card className="p-4">
              <Text className="text-sm">
                Money received in the last {RANGES.find((r) => r.value === range)?.label}
              </Text>
              <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                {formatMoney(totals.net, currency)}
              </Heading>
              <Text className="mt-1 text-sm">
                from {totals.orders === 1 ? '1 order' : `${String(totals.orders)} orders`} across{' '}
                {rows.length === 1 ? '1 place' : `${String(rows.length)} places`}
              </Text>

              <div className="mt-4 flex flex-col gap-3">
                {rows.map((r) => (
                  <div
                    key={r.key}
                    className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm"
                  >
                    <span className="truncate">{channelLabel(r.channel, r.source)}</span>
                    <Progress
                      color="module"
                      value={r.net}
                      max={topNet}
                      aria-label={`${channelLabel(r.channel, r.source)}: ${formatMoney(r.net, currency)}`}
                    />
                    <span className="text-right font-medium tabular-nums">
                      {formatMoneyCompact(r.net, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* The figures in full — a breakdown, not a tease. */}
            <Card className="overflow-hidden">
              <header className="border-base-300 border-b px-4 py-3">
                <Heading level={3} className="text-base font-semibold">
                  The numbers
                </Heading>
              </header>
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Where</th>
                    <th className="text-right">Orders</th>
                    <th className="hidden text-right @lg:table-cell">Sales</th>
                    <th className="hidden text-right @xl:table-cell">Refunds</th>
                    <th className="text-right">Received</th>
                    <th className="text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key}>
                      <td className="font-medium">{channelLabel(r.channel, r.source)}</td>
                      <td className="text-right tabular-nums">{r.orders}</td>
                      <td className="hidden text-right tabular-nums @lg:table-cell">
                        {formatMoney(r.gross, currency)}
                      </td>
                      <td className="hidden text-right tabular-nums @xl:table-cell">
                        {r.refunds > 0 ? `−${formatMoney(r.refunds, currency)}` : '—'}
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {formatMoney(r.net, currency)}
                      </td>
                      <td className="text-right tabular-nums">{sharePct(r.net, totals.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-base-300 border-t font-medium">
                    <td>All places</td>
                    <td className="text-right tabular-nums">{totals.orders}</td>
                    <td className="hidden text-right tabular-nums @lg:table-cell">
                      {formatMoney(totals.gross, currency)}
                    </td>
                    <td className="hidden text-right tabular-nums @xl:table-cell">
                      {totals.refunds > 0 ? `−${formatMoney(totals.refunds, currency)}` : '—'}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(totals.net, currency)}</td>
                    <td className="text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </Table>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
