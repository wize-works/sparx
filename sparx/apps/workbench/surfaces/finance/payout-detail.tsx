'use client';

// One payout — the deposit, and the individual sales it settles.
//
// A read-only detail pane: it opens with a real heading saying WHAT this is (a
// bank deposit, its amount, when it arrives), then breaks the figure down into the
// sales that make it up. Each sale opens its order. Being a durable, addressable
// thing you'd return to is exactly why a payout is a pane and not a modal.

import { useEffect } from 'react';
import { Badge, Button, Card, EmptyState, Heading, Table, Text } from '@wizeworks/silicaui-react';
import { Banknote } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { usePayout, type PayoutSale } from './payouts-data';
import { channelLabel, formatMoney, formatDate, methodLabel, payoutState } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PayoutDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = usePayout(id);

  useEffect(() => {
    if (data) ctx.setTitle(`Deposit · ${formatDate(data.arrivalDate)}`);
  }, [data, ctx]);

  const openOrder = (sale: PayoutSale, event: { shiftKey: boolean; altKey: boolean }) => {
    if (!sale.orderId) return;
    ctx.open('commerce.order.detail', { id: sale.orderId }, { target: targetFor(event) });
  };

  const state = data ? payoutState(data.status) : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Payout controls"
        status={<p className="text-sm">Deposit</p>}
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
            icon={<Banknote className="size-6" aria-hidden />}
            title="Could not load this deposit"
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
            Loading deposit…
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {/* Identity first: what this is, how much, when, and whether it has
                landed — the four things you opened it to confirm. */}
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Heading level={2} className="text-3xl font-semibold tabular-nums">
                    {formatMoney(data.amount, data.currency)}
                  </Heading>
                  <Text className="mt-1">
                    {methodLabel(data.processor)} sales · arriving {formatDate(data.arrivalDate)}
                  </Text>
                </div>
                {state ? (
                  <Badge color={state.tone} variant="soft">
                    {state.label}
                  </Badge>
                ) : null}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <header className="border-base-300 flex items-center gap-2 border-b px-4 py-3">
                <Heading level={3} className="text-base font-semibold">
                  What this deposit is made of
                </Heading>
                <div className="flex-1" />
                <Text className="text-sm">
                  {data.sales.length === 1 ? '1 sale' : `${String(data.sales.length)} sales`}
                </Text>
              </header>
              {data.sales.length === 0 ? (
                <div className="p-4">
                  <Text>No sales are recorded against this deposit.</Text>
                </div>
              ) : (
                <Table size="sm" hover>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th className="hidden @lg:table-cell">Where</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((sale) => (
                      <tr
                        key={sale.paymentId}
                        className="cursor-pointer"
                        tabIndex={0}
                        role="button"
                        onClick={(event) => {
                          openOrder(sale, event);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          openOrder(sale, event);
                        }}
                      >
                        <td className="font-mono text-sm">{sale.orderNumber}</td>
                        <td>{sale.customerName ?? 'Guest'}</td>
                        <td className="hidden whitespace-nowrap @lg:table-cell">
                          {channelLabel(sale.channel, sale.source)}
                        </td>
                        <td className="text-right font-medium tabular-nums">
                          {formatMoney(sale.amount, sale.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>

            <RowOpenHint what="a sale to open its order" />
          </div>
        )}
      </div>
    </div>
  );
}
