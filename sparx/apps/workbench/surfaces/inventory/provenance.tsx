'use client';

// WHY IS THIS NUMBER WHAT IT IS?
//
// ── The point ────────────────────────────────────────────────────────────
//
// Open this from any stock quantity in the product and it explains that exact
// number: what it is made of, what changed it and who, who is holding the rest,
// how old it is, and — the bit nobody else can do — whether adding up the item's
// entire recorded history still comes to the same total.
//
// That last line is the whole trust argument in one sentence, so it is shown
// first and in plain words, not buried as a technical footnote.
//
// ── Read-only, and that is deliberate ────────────────────────────────────
//
// There is nothing to change here. Someone arriving at this pane is asking a
// question, not making a decision, and putting an "adjust" button beside an
// explanation invites the reflex fix — type the number you expected — which is
// exactly how a wrong figure becomes a permanent one with no trace of the
// disagreement. The routes out are to the item and to counting it.
//
// ── A pane, not a dialog ─────────────────────────────────────────────────
//
// It is opened BESIDE the thing it explains. A dialog would cover the number the
// person is asking about, which is the one thing they need to keep looking at.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { CheckCircle2, ExternalLink, TriangleAlert } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { holderLabel, movementReason, plural } from './data';
import { humanDuration, stockAgeTone } from './integrity-data';
import {
  actorLabel,
  bufferSourceLabel,
  useStockProvenance,
  type StockProvenance,
} from './provenance-data';

const NUMBER = new Intl.NumberFormat();

/* ── The claim, checked ──────────────────────────────────────────────────── */

function ReconcileBanner({ data }: { data: StockProvenance }) {
  if (data.reconciles) {
    return (
      <Alert color="success" variant="soft">
        <CheckCircle2 className="size-5 shrink-0" aria-hidden />
        <AlertContent>
          <AlertTitle>This number adds up</AlertTitle>
          <AlertDescription>
            Every one of the {plural(data.movementCount, 'recorded change', 'recorded changes')} to
            this item here, added together, comes to exactly {NUMBER.format(data.onHand)}. Nothing
            has moved that was not written down.
          </AlertDescription>
        </AlertContent>
      </Alert>
    );
  }
  return (
    <Alert color="danger" variant="soft">
      <TriangleAlert className="size-5 shrink-0" aria-hidden />
      <AlertContent>
        <AlertTitle>This number does not add up</AlertTitle>
        <AlertDescription>
          The record says {NUMBER.format(data.onHand)}, but adding up every change ever recorded
          gives {NUMBER.format(data.derivedOnHand)} — a difference of{' '}
          {NUMBER.format(Math.abs(data.onHand - data.derivedOnHand))}. Nothing has been altered.
          Count this item to settle it, so the correction is recorded as a real count.
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}

/* ── The number, taken apart ─────────────────────────────────────────────── */

function Breakdown({ data }: { data: StockProvenance }) {
  const rows: { label: string; value: number; note: string; emphasis?: boolean }[] = [
    {
      label: 'On the shelf',
      value: data.onHand,
      note: 'What you physically have here, according to the record.',
    },
    {
      label: 'Spoken for',
      value: -data.allocated,
      note:
        data.holds.length > 0
          ? `Held by ${plural(data.holds.length, 'basket or order', 'baskets and orders')} — listed below.`
          : 'Nothing is holding any of it.',
    },
    {
      label: 'Held back',
      value: -data.safetyBuffer,
      note:
        data.safetyBuffer === 0
          ? 'You are not withholding any as a cushion.'
          : 'A cushion you chose to keep off sale.',
    },
    {
      label: 'Free to sell',
      value: data.sellable,
      note: 'What a customer could actually buy right now.',
      emphasis: true,
    },
  ];

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <Heading level={2} className="text-lg font-semibold">
        How the number breaks down
      </Heading>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className={
              row.emphasis
                ? 'border-base-300 flex flex-col gap-0.5 border-t pt-2'
                : 'flex flex-col gap-0.5'
            }
          >
            <div className="flex items-baseline justify-between gap-3">
              <Text className={row.emphasis ? 'font-semibold' : ''}>{row.label}</Text>
              <Text
                className={
                  row.emphasis ? 'text-module text-xl font-semibold tabular-nums' : 'tabular-nums'
                }
              >
                {row.value > 0 && !row.emphasis ? '' : ''}
                {NUMBER.format(row.value)}
              </Text>
            </div>
            <Text className="text-sm">{row.note}</Text>
          </li>
        ))}
      </ul>

      {data.channel ? (
        <div className="border-base-300 flex flex-col gap-0.5 border-t pt-2">
          <div className="flex items-baseline justify-between gap-3">
            <Text className="font-semibold">On {data.channel.channel}</Text>
            <Text className="text-module text-xl font-semibold tabular-nums">
              {NUMBER.format(data.channel.sellable)}
            </Text>
          </div>
          <Text className="text-sm">
            Holding back {plural(data.channel.buffer, 'unit', 'units')} (
            {bufferSourceLabel(data.channel.bufferSource)})
            {data.channel.stalenessExtraBuffer > 0
              ? `, plus ${data.channel.stalenessExtraBuffer} more while a connected system is late`
              : ''}
            .
          </Text>
          {data.channel.channelsPaused ? (
            <Text className="text-danger text-sm">
              Selling this stock on connected channels is paused until its feed updates.
            </Text>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ── How old it is, and who last touched it ──────────────────────────────── */

function Freshness({ data }: { data: StockProvenance }) {
  const tone = stockAgeTone(data.ageSeconds);
  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading level={2} className="text-lg font-semibold">
          How current this is
        </Heading>
        <Badge color={tone} variant="soft">
          {humanDuration(data.ageSeconds)} old
        </Badge>
      </div>
      <Text className="text-sm">
        Last established <Timestamp value={data.asOf} format="relative" />
        {data.lastMovementAt ? (
          <>
            {' '}
            · last change recorded <Timestamp value={data.lastMovementAt} format="relative" />
          </>
        ) : null}
        .
      </Text>

      {data.sources.length === 0 ? (
        <Text className="text-sm">
          This number is kept in sparx — nothing outside is feeding it.
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.sources.map((source) => (
            <li key={source.sourceId} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Text className="font-medium">{source.name}</Text>
                <Badge color={source.isStale ? 'danger' : 'success'} variant="soft">
                  {source.isStale ? 'Late' : 'Up to date'}
                </Badge>
              </div>
              <Text className="text-sm">
                Sends this item as <span className="font-mono">{source.externalSku}</span>
                {source.unitsPerExternal !== 1
                  ? `, counted in packs of ${source.unitsPerExternal}`
                  : ''}
                .{' '}
                {source.lastSyncAt ? (
                  <>
                    Last reported <Timestamp value={source.lastSyncAt} format="relative" />.
                  </>
                ) : (
                  'It has never reported.'
                )}
              </Text>
              {source.linkIsStale ? (
                <Text className="text-warning text-sm">
                  This item was missing from the last full update — it may have been removed at
                  their end.
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── What changed it ─────────────────────────────────────────────────────── */

function RecentChanges({ data }: { data: StockProvenance }) {
  if (data.recentMovements.length === 0) {
    return (
      <section className="card bg-base-100 flex flex-col gap-2 p-4">
        <Heading level={2} className="text-lg font-semibold">
          What changed it
        </Heading>
        <Text className="text-sm">
          Nothing has ever moved this item here. The number is zero because it has never been
          anything else.
        </Text>
      </section>
    );
  }

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          What changed it
        </Heading>
        <Text className="text-sm">
          The most recent {data.recentMovements.length} of{' '}
          {plural(data.movementCount, 'recorded change', 'recorded changes')}, newest first. The
          running total is what the number was immediately after each one.
        </Text>
      </div>
      <Table className="table-sm">
        <thead>
          <tr>
            <th>What happened</th>
            <th className="text-right">Change</th>
            <th className="text-right">Left</th>
            <th className="hidden @lg:table-cell">Who</th>
            <th className="hidden @lg:table-cell">When</th>
          </tr>
        </thead>
        <tbody>
          {data.recentMovements.map((movement) => (
            <tr key={movement.id}>
              <td>
                <Text className="font-medium">{movementReason(movement.reason)}</Text>
                {movement.note ? <Text className="text-sm">{movement.note}</Text> : null}
              </td>
              <td className="text-right">
                {/* Direction is the meaning here, so it carries the color — a
                    grey column of signed integers makes the reader do the work
                    the color could do instantly. */}
                <Badge color={movement.delta > 0 ? 'success' : 'warning'} variant="soft">
                  {movement.delta > 0 ? '+' : ''}
                  {NUMBER.format(movement.delta)}
                </Badge>
              </td>
              <td className="text-right tabular-nums">
                {movement.balanceAfter === null ? '—' : NUMBER.format(movement.balanceAfter)}
              </td>
              <td className="hidden @lg:table-cell">
                <Text className="text-sm">{actorLabel(movement)}</Text>
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                <Timestamp value={movement.createdAt} format="relative" />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

/* ── Who is holding the rest ─────────────────────────────────────────────── */

function Holds({ data }: { data: StockProvenance }) {
  if (data.holds.length === 0) return null;
  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          Who is holding it
        </Heading>
        <Text className="text-sm">
          &ldquo;{NUMBER.format(data.allocated)} spoken for&rdquo; is a number. This is what is
          holding them, and when — if ever — it frees up.
        </Text>
      </div>
      <ul className="flex flex-col gap-2">
        {data.holds.map((hold) => (
          <li key={hold.id} className="flex flex-wrap items-baseline justify-between gap-2">
            <Text>
              <span className="font-medium tabular-nums">{NUMBER.format(hold.quantity)}</span> ·{' '}
              {holderLabel(hold.holderType)}
            </Text>
            <Text className="text-sm">
              {hold.expiresAt ? (
                <>
                  frees up <Timestamp value={hold.expiresAt} format="relative" />
                </>
              ) : (
                'held until it ships or is cancelled'
              )}
            </Text>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── The surface ─────────────────────────────────────────────────────────── */

export function ProvenanceSurface({ ctx }: { ctx: SurfaceContext }) {
  // Addressed by the pair that identifies a stock number: which item, and where.
  // `id` is the variant so the pane keys the same way every other item-scoped
  // surface does; the location rides alongside.
  const variantId = typeof ctx.params.variantId === 'string' ? ctx.params.variantId : undefined;
  const warehouseId =
    typeof ctx.params.warehouseId === 'string' ? ctx.params.warehouseId : undefined;
  const channel = typeof ctx.params.channel === 'string' ? ctx.params.channel : undefined;

  const query = useStockProvenance(variantId, warehouseId, channel);
  const data = query.data;

  if (!variantId || !warehouseId) {
    return (
      <div className={PANE_SHELL}>
        <EmptyState>
          <Text>Open this from a stock number to see where it came from.</Text>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Explanation controls"
        controls={
          <>
            {data ? (
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                onClick={() => {
                  ctx.open('inventory.stock.item', { variantId: data.variantId });
                }}
              >
                <ExternalLink className="size-4" aria-hidden />
                Open the item
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={query.isFetching}
            updatedAt={data ? query.dataUpdatedAt : undefined}
            onRefresh={() => {
              void query.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {query.isLoading ? (
            <EmptyState>
              <Text>Working out where this number came from…</Text>
            </EmptyState>
          ) : !data ? (
            <EmptyState>
              <Text>
                Nothing has ever moved this item at this location, so there is no number to explain
                yet.
              </Text>
            </EmptyState>
          ) : (
            <>
              <Card className="shrink-0">
                <div className="flex flex-col gap-1 p-4">
                  <Heading level={1} className="text-xl font-semibold">
                    {data.productTitle ?? data.variantSku ?? 'This item'}
                  </Heading>
                  <Text className="text-sm">
                    {data.variantSku ? `${data.variantSku} · ` : ''}
                    at {data.warehouseName ?? data.warehouseCode ?? 'this location'}
                  </Text>
                </div>
              </Card>

              <ReconcileBanner data={data} />
              <Breakdown data={data} />
              <Holds data={data} />
              <Freshness data={data} />
              <RecentChanges data={data} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
