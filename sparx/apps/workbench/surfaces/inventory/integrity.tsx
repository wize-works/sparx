'use client';

// INTEGRITY — can you trust these numbers?
//
// ── Why this surface exists ──────────────────────────────────────────────
//
// Every stock system in the world shows you a quantity and asks you to believe
// it. Ours records every single change with who made it, when, and why — so it
// can be CHECKED instead, and this is where the checking is shown.
//
// The order of the page is the order of the questions someone asks when a number
// looks wrong, and it is deliberate:
//
//   1. Does it add up?        the nightly check, and what it found
//   2. What doesn't?          the specific items whose history and record disagree
//   3. Who has this cost me?  sales refused or over-promised, and why
//   4. Is anything stale?     connected systems that have gone quiet
//
// ── A clean result is a RESULT ───────────────────────────────────────────
//
// The most common outcome here is "everything adds up", and that is shown
// loudly and in green rather than as an empty screen. A page that only speaks
// up when something is wrong teaches people it is broken when it is silent.
//
// ── Nothing here fixes anything ──────────────────────────────────────────
//
// There is exactly one button and it re-runs the check. A disagreement is never
// corrected automatically: overwriting the stored number with the recalculated
// one would destroy the evidence, and if the history is the damaged side it
// would spread the damage into a record that was fine. The fix is a stock count,
// which is a deliberate human act on a different surface — so the drift rows
// link there rather than offering a tempting one-click "correct it".

import { useState } from 'react';
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
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import {
  CheckCircle2,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural } from './data';
import {
  freshnessVerdict,
  humanDuration,
  oversellKind,
  policyLabel,
  runVerdict,
  useDrifts,
  useOversellSummary,
  useReconciliationRuns,
  useRunReconciliation,
  useSourceFreshness,
  type OversellSummary,
  type ReconciliationDrift,
  type ReconciliationRun,
  type SourceFreshness,
} from './integrity-data';
import { useOversellIncidents, type OversellIncident } from './integrity-data';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';
const NUMBER = new Intl.NumberFormat();

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/* ── 1. Does it add up? ──────────────────────────────────────────────────── */

function Verdict({
  latest,
  history,
  openDrifts,
  onRecheck,
  rechecking,
}: {
  latest: ReconciliationRun | undefined;
  history: ReconciliationRun[];
  openDrifts: number;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const verdict = latest ? runVerdict(latest) : null;
  // Consecutive clean runs, counted back from the latest. "Clean for 14 nights"
  // is a far stronger statement than one green tick, and it costs nothing to say.
  const streak = (() => {
    let n = 0;
    for (const run of history) {
      if (run.status !== 'ok') break;
      n += 1;
    }
    return n;
  })();

  return (
    <Card className="shrink-0">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {verdict?.tone === 'success' ? (
              <CheckCircle2 className="text-success mt-0.5 size-8 shrink-0" aria-hidden />
            ) : verdict?.tone === 'danger' ? (
              <TriangleAlert className="text-danger mt-0.5 size-8 shrink-0" aria-hidden />
            ) : (
              <ShieldCheck className="text-module mt-0.5 size-8 shrink-0" aria-hidden />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <Heading level={2} className="text-xl font-semibold">
                {verdict ? verdict.label : 'Not checked yet'}
              </Heading>
              <Text className="text-sm">
                {latest ? (
                  <>
                    Every change ever recorded was added back up and compared with{' '}
                    {plural(latest.levelsChecked, 'stock record', 'stock records')}
                    {latest.finishedAt ? (
                      <>
                        {' '}
                        <Timestamp value={latest.finishedAt} format="relative" />
                      </>
                    ) : null}
                    .
                  </>
                ) : (
                  'The check runs every night. Run it now to see where you stand.'
                )}
              </Text>
              {streak > 1 ? (
                <Text className="text-sm">Clean {plural(streak, 'check', 'checks')} in a row.</Text>
              ) : null}
            </div>
          </div>
          <Button
            color="module-inventory"
            onClick={onRecheck}
            disabled={rechecking}
            className="shrink-0"
          >
            <RefreshCw className={rechecking ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
            {rechecking ? 'Checking…' : 'Check now'}
          </Button>
        </div>

        {latest ? (
          <Stats className="grid grid-cols-1 gap-2 @2xl:grid-cols-3">
            <Stat>
              <StatTitle>Records checked</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {NUMBER.format(latest.levelsChecked)}
              </StatValue>
              <StatDesc>
                {latest.durationMs === null
                  ? 'Still running'
                  : `Took ${humanDuration(Math.round(latest.durationMs / 1000))}`}
              </StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Do not add up</StatTitle>
              <StatValue
                className={
                  openDrifts > 0 ? 'text-danger text-2xl tabular-nums' : 'text-2xl tabular-nums'
                }
              >
                {NUMBER.format(openDrifts)}
              </StatValue>
              <StatDesc>
                {openDrifts === 0
                  ? 'Nothing outstanding'
                  : 'Still unresolved — count these to settle them'}
              </StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Value in question</StatTitle>
              <StatValue
                className={
                  latest.driftValueCents > 0
                    ? 'text-warning text-2xl tabular-nums'
                    : 'text-2xl tabular-nums'
                }
              >
                {formatCents(latest.driftValueCents)}
              </StatValue>
              <StatDesc>
                {latest.driftUnits === 0
                  ? 'No units unaccounted for'
                  : `${plural(latest.driftUnits, 'unit', 'units')} unaccounted for`}
              </StatDesc>
            </Stat>
          </Stats>
        ) : null}

        {latest?.status === 'error' ? (
          <Alert color="warning">
            <AlertContent>
              <AlertTitle>The last check could not finish</AlertTitle>
              <AlertDescription>
                {latest.error ?? 'No reason was recorded.'} Nothing is known to be wrong — but
                nothing has been confirmed right either. Run it again.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}
      </div>
    </Card>
  );
}

/* ── 2. What doesn't add up? ─────────────────────────────────────────────── */

function DriftsCard({
  drifts,
  onOpenItem,
}: {
  drifts: ReconciliationDrift[];
  onOpenItem: (variantId: string, target: OpenTarget) => void;
}) {
  if (drifts.length === 0) return null;

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          Items that do not add up
        </Heading>
        <Text className="text-sm">
          For each of these, the number on the record and the number you get by adding up its
          history disagree. Nothing has been changed — settle one by counting it, so the correction
          is recorded as a real count rather than an overwrite.
        </Text>
      </div>
      <Table className="table-sm">
        <thead>
          <tr>
            <th>Item</th>
            <th className="hidden @lg:table-cell">Where</th>
            <th className="text-right">On record</th>
            <th className="text-right">From its history</th>
            <th className="text-right">Difference</th>
            <th className="hidden text-right @xl:table-cell">Worth</th>
          </tr>
        </thead>
        <tbody>
          {drifts.map((drift) => (
            <tr
              key={drift.id}
              className="hover:bg-base-200 cursor-pointer"
              tabIndex={0}
              onClick={(event) => onOpenItem(drift.variantId, targetFor(event))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenItem(drift.variantId, 'tab');
                }
              }}
            >
              <td className="max-w-56">
                <span className="block truncate font-medium">
                  {drift.productTitle ?? drift.variantSku ?? 'Unnamed item'}
                </span>
                {drift.variantSku ? <span className="text-sm">{drift.variantSku}</span> : null}
              </td>
              <td className="hidden max-w-40 truncate @lg:table-cell">
                {drift.warehouseName ?? drift.warehouseCode}
              </td>
              <td className="text-right tabular-nums">{NUMBER.format(drift.recordedOnHand)}</td>
              <td className="text-right tabular-nums">{NUMBER.format(drift.derivedOnHand)}</td>
              <td className="text-right">
                {/* The SIGN carries the meaning, so it gets the color: a record
                    claiming more than its history can explain is the direction
                    that oversells, and it is the one worth flinching at. */}
                <Badge color={drift.delta > 0 ? 'danger' : 'warning'} variant="soft">
                  {drift.delta > 0 ? '+' : ''}
                  {NUMBER.format(drift.delta)}
                </Badge>
              </td>
              <td className="hidden text-right tabular-nums @xl:table-cell">
                {formatCents(drift.valueCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

/* ── 3. What has this cost? ──────────────────────────────────────────────── */

function OversellCard({
  summary,
  incidents,
  onOpenItem,
}: {
  summary: OversellSummary | undefined;
  incidents: OversellIncident[];
  onOpenItem: (variantId: string, target: OpenTarget) => void;
}) {
  const total = summary ? summary.blocked + summary.allowed + summary.negativeOnHand : 0;

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          When you ran out
        </Heading>
        <Text className="text-sm">
          Every time in the last {summary?.windowDays ?? 30} days a sale was turned away for lack of
          stock, or taken when there was not enough to cover it. Each one remembers what the system
          believed it had at that exact moment.
        </Text>
      </div>

      {summary ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col">
            <Text className="text-warning text-2xl font-semibold tabular-nums">
              {NUMBER.format(summary.blocked)}
            </Text>
            <Text className="text-sm">Sales refused</Text>
          </div>
          <div className="flex flex-col">
            <Text className="text-info text-2xl font-semibold tabular-nums">
              {NUMBER.format(summary.allowed)}
            </Text>
            <Text className="text-sm">Promised anyway</Text>
          </div>
          <div className="flex flex-col">
            <Text className="text-danger text-2xl font-semibold tabular-nums">
              {NUMBER.format(summary.negativeOnHand)}
            </Text>
            <Text className="text-sm">Sold below zero</Text>
          </div>
        </div>
      ) : null}

      {total === 0 ? (
        <Text className="text-sm">
          Nothing ran out. Every order that came in could be filled from what you had.
        </Text>
      ) : (
        <>
          {summary && summary.variantsAffected > 0 ? (
            <Text className="text-sm">
              {plural(summary.unitsShort, 'unit', 'units')} short across{' '}
              {plural(summary.variantsAffected, 'item', 'items')}.
              {summary.variantsAffected < total
                ? ' A few items account for most of it — worth setting their reorder point higher.'
                : ''}
            </Text>
          ) : null}
          <Table className="table-sm">
            <thead>
              <tr>
                <th>Item</th>
                <th>What happened</th>
                <th className="hidden @lg:table-cell">Setting</th>
                <th className="text-right">Wanted</th>
                <th className="text-right">Had</th>
                <th className="hidden @xl:table-cell">Number was</th>
                <th className="hidden @xl:table-cell">When</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => {
                const kind = oversellKind(incident.kind);
                return (
                  <tr
                    key={incident.id}
                    className="hover:bg-base-200 cursor-pointer"
                    tabIndex={0}
                    onClick={(event) => onOpenItem(incident.variantId, targetFor(event))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpenItem(incident.variantId, 'tab');
                      }
                    }}
                  >
                    <td className="max-w-56">
                      <span className="block truncate font-medium">
                        {incident.productTitle ?? incident.variantSku ?? 'Unnamed item'}
                      </span>
                      {incident.channel ? (
                        <span className="text-sm">via {incident.channel}</span>
                      ) : null}
                    </td>
                    <td>
                      <Badge color={kind.tone} variant="soft">
                        {kind.label}
                      </Badge>
                    </td>
                    <td className="hidden @lg:table-cell">
                      <Text className="text-sm">{policyLabel(incident.policy)}</Text>
                    </td>
                    <td className="text-right tabular-nums">
                      {NUMBER.format(incident.requestedQuantity)}
                    </td>
                    <td className="text-right tabular-nums">
                      {NUMBER.format(incident.availableQuantity)}
                    </td>
                    <td className="hidden @xl:table-cell">
                      {/* The age of the number at the moment of the decision. A
                          cluster of these next to a four-hour-old figure IS the
                          diagnosis, and it is invisible anywhere else. */}
                      {incident.stockAgeSeconds === null ? (
                        <Text className="text-sm">—</Text>
                      ) : (
                        <Text className="text-sm">
                          {humanDuration(incident.stockAgeSeconds)} old
                        </Text>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap @xl:table-cell">
                      <Timestamp value={incident.occurredAt} format="relative" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </>
      )}
    </section>
  );
}

/* ── 4. Is anything stale? ───────────────────────────────────────────────── */

function FreshnessCard({ sources }: { sources: SourceFreshness[] }) {
  const withPromise = sources.filter((s) => s.expectedIntervalSec > 0);
  const exempt = sources.length - withPromise.length;

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          Connected systems
        </Heading>
        <Text className="text-sm">
          A connection whose last update worked but was days ago looks perfectly healthy everywhere
          else, and its numbers are worthless. Each one below promises how often it will report;
          this is whether it has kept that promise.
        </Text>
      </div>

      {sources.length === 0 ? (
        <Text className="text-sm">
          You are not pulling stock from anywhere else — every number here was recorded in sparx.
        </Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {withPromise.map((source) => {
            const verdict = freshnessVerdict(source);
            return (
              <li key={source.sourceId} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Text className="flex min-w-0 items-center gap-1.5">
                    {source.isStale ? (
                      <WifiOff className="text-danger size-4 shrink-0" aria-hidden />
                    ) : (
                      <ScanLine className="text-success size-4 shrink-0" aria-hidden />
                    )}
                    <span className="truncate font-medium">{source.name}</span>
                  </Text>
                  {verdict ? (
                    <Badge color={verdict.tone} variant="soft">
                      {verdict.label}
                    </Badge>
                  ) : null}
                </div>
                <Text className="text-sm">
                  {verdict?.detail} Feeds {plural(source.linkedLevels, 'line', 'lines')}.
                </Text>
              </li>
            );
          })}
          {exempt > 0 ? (
            <li>
              <Text className="text-sm">
                {plural(exempt, 'other connection has', 'other connections have')} not been given a
                schedule to keep, so nothing is checked for {exempt === 1 ? 'it' : 'them'}.
              </Text>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}

/* ── The surface ─────────────────────────────────────────────────────────── */

export function IntegritySurface({ ctx }: { ctx: SurfaceContext }) {
  const [windowDays] = useState(30);

  const runs = useReconciliationRuns();
  const drifts = useDrifts();
  const summary = useOversellSummary(windowDays);
  const incidents = useOversellIncidents({ take: 25, skip: 0 });
  const freshness = useSourceFreshness();
  const recheck = useRunReconciliation();

  const loading = runs.isLoading || drifts.isLoading || summary.isLoading || freshness.isLoading;

  const openItem = (variantId: string, target: OpenTarget) => {
    ctx.open('inventory.stock.item', { variantId }, { target });
  };

  const refreshAll = () => {
    void runs.refetch();
    void drifts.refetch();
    void summary.refetch();
    void incidents.refetch();
    void freshness.refetch();
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Integrity controls"
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={
              runs.isFetching || drifts.isFetching || summary.isFetching || freshness.isFetching
            }
            updatedAt={runs.data ? runs.dataUpdatedAt : undefined}
            onRefresh={refreshAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {loading && !runs.data ? (
            <EmptyState>
              <Text>Checking the books…</Text>
            </EmptyState>
          ) : (
            <>
              <Verdict
                latest={runs.data?.items[0]}
                history={runs.data?.items ?? []}
                openDrifts={drifts.data?.total ?? drifts.data?.items.length ?? 0}
                onRecheck={() => recheck.mutate({ scope: 'full' })}
                rechecking={recheck.isPending}
              />
              <DriftsCard drifts={drifts.data?.items ?? []} onOpenItem={openItem} />
              <OversellCard
                summary={summary.data}
                incidents={incidents.data?.items ?? []}
                onOpenItem={openItem}
              />
              <FreshnessCard sources={freshness.data ?? []} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
