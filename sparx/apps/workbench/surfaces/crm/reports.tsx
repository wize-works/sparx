'use client';

// Reports — how the customer base is doing.
//
// A metrics surface, not a table: KPI tiles across the top, then panels that each
// answer one question — who is joining, how the pipeline is shaped, who wins
// work, where customers come from, and how the audiences are sized. Every panel
// owns its own loading and empty state, so one slow query is one quiet tile, not
// a blank page. Charts use the app's chart wrapper; everything else is silica.
//
// EVERY FIGURE GOES SOMEWHERE. "Overdue tasks: 7" is the number a person wants
// to click, and for a while this surface answered every one of them with a dead
// end — it took `ctx` and threw it away, so reading a figure and then acting on
// it meant hunting the same records down again through the rail. Each tile is a
// `ClickableCard` onto the list it counts, and each panel that summarises a list
// carries the way into it.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  ClickableCard,
  EmptyState,
  Heading,
  Select,
  Text,
} from '@wizeworks/silicaui-react';
import { Chart, type EChartsOption } from '@wizeworks/silicaui-charts';
import { ArrowUpRight, BarChart3 } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useTeamRoster } from '../../lib/api/team';
import { usePipelines } from './pipelines-data';
import { useModuleColor } from '../analytics/charts';
import {
  formatMoney,
  monthLabel,
  useAcquisition,
  usePipelineFunnel,
  useLeadsBySource,
  useSegmentSummary,
  useSnapshot,
  useTaskMetrics,
  useWinLoss,
  useRefreshReports,
  type AcquisitionPoint,
} from './reports-data';

/* ── Proportion bar (a functional data bar, quantised widths, no inline style) ── */

const BAR_WIDTH = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
];

function ProportionRow({
  label,
  value,
  peak,
  trailing,
}: {
  label: string;
  value: number;
  peak: number;
  trailing: string;
}) {
  const step = value <= 0 ? 0 : Math.round((value / Math.max(1, peak)) * 20);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{trailing}</span>
      </div>
      <div className="bg-base-200 h-1.5 overflow-hidden rounded-full">
        <div className={`bg-module h-full rounded-full ${BAR_WIDTH[step] ?? 'w-0'}`} />
      </div>
    </div>
  );
}

/* ── KPI tile + panel shell ─────────────────────────────────────────────── */

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/**
 * One figure, and the way to what it counts.
 *
 * `alarm` is the tile's only color, and it is a state rather than a label: five
 * overdue tasks is a different fact from five open ones, and none overdue is not
 * a red fact at all — so the tone appears only when the number is actually
 * saying something.
 */
function KpiTile({
  label,
  value,
  alarm = false,
  onOpen,
}: {
  label: string;
  value: string;
  alarm?: boolean;
  onOpen?: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  // silica's universal soft treatment — a theme-aware color-mix into the
  // surface, the same one `<Card variant="module">` tinting uses.
  const tone = alarm ? 'bg-danger bg-soft' : '';
  const body = (
    <CardBody className="gap-1 p-3">
      <span className="text-sm">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </CardBody>
  );
  if (!onOpen) return <Card className={tone}>{body}</Card>;
  return (
    <ClickableCard
      className={`text-left ${tone}`}
      aria-label={`${label}: ${value} — open the list`}
      onClick={(event) => {
        onOpen(event);
      }}
    >
      {body}
    </ClickableCard>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <Heading level={2} className="text-base font-semibold">
            {title}
          </Heading>
          {action}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

/** The way out of a panel and into the records it summarises. */
function PanelLink({
  label,
  onOpen,
}: {
  label: string;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <Button
      color="module"
      variant="ghost"
      size="sm"
      className="gap-1"
      onClick={(event) => {
        onOpen(event);
      }}
    >
      {label}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Button>
  );
}

function Loading() {
  return (
    <Text className="text-sm" role="status">
      Loading…
    </Text>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm">{children}</Text>;
}

/* ── Bands ──────────────────────────────────────────────────────────────── */

/** Task urgency, in the order a person reads a queue: worst first. */
const PRIORITY_BANDS = [
  { key: 'urgent', label: 'Urgent', tone: 'danger' },
  { key: 'high', label: 'High', tone: 'warning' },
  { key: 'medium', label: 'Medium', tone: 'info' },
  { key: 'low', label: 'Low', tone: 'neutral' },
] as const;

/** A win rate is a verdict, not a measurement — half the work won is a good
 *  quarter, a fifth is a problem, and rendering both as the same grey number
 *  makes the reader do the arithmetic the color could have done. */
function winRateTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 0.5) return 'success';
  if (rate >= 0.25) return 'warning';
  return 'danger';
}

/* ── Acquisition chart ──────────────────────────────────────────────────── */

function AcquisitionChart({ points }: { points: AcquisitionPoint[] }) {
  const { ref, color } = useModuleColor();
  const option = useMemo<EChartsOption>(
    () => ({
      ...(color ? { color: [color] } : {}),
      grid: { left: 4, right: 8, top: 12, bottom: 2, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: points.map((p) => monthLabel(p.month)),
        axisTick: { show: false },
        axisLabel: { hideOverlap: true },
      },
      yAxis: { type: 'value', splitNumber: 3, minInterval: 1 },
      series: [
        {
          type: 'bar',
          data: points.map((p) => p.newCustomers),
          barMaxWidth: 28,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [points, color]
  );
  return (
    <div ref={ref} className="w-full">
      <Chart option={option} className="h-56 w-full" aria-label="New customers per month" />
    </div>
  );
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function CrmReportsSurface({ ctx }: { ctx: SurfaceContext }) {
  const snapshot = useSnapshot();
  const acquisition = useAcquisition(12);
  const winLoss = useWinLoss();
  const leads = useLeadsBySource();
  const tasks = useTaskMetrics();
  const segments = useSegmentSummary();
  const { data: pipelines } = usePipelines();
  const { members: roster } = useTeamRoster();
  const refreshAll = useRefreshReports();

  const [pipelineId, setPipelineId] = useState<string>('');
  const activePipeline = pipelineId || pipelines?.items[0]?.id;
  const funnel = usePipelineFunnel(activePipeline);

  /** Every figure's way through to the records behind it. Shift opens it
   *  alongside, alt in its own window — the same gesture as every CRM list. */
  const go = (key: string, params: Record<string, string> = {}) => {
    return (event: { shiftKey: boolean; altKey: boolean }) => {
      ctx.open(key, params, { target: targetFor(event) });
    };
  };

  const repName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of roster) map.set(m.userId, m.name ?? m.email);
    return map;
  }, [roster]);

  const s = snapshot.data;
  const acqPoints = acquisition.data ?? [];
  const acqHasData = acqPoints.some((p) => p.newCustomers > 0);
  const funnelPeak = Math.max(1, ...(funnel.data ?? []).map((b) => b.count));
  const leadPeak = Math.max(1, ...(leads.data?.bySource ?? []).map((r) => r.count));
  const segPeak = Math.max(1, ...(segments.data?.segments ?? []).map((r) => r.memberCount));

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Reports controls"
        status={
          <Text as="span" className="text-sm font-medium">
            How your customers are doing
          </Text>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={snapshot.isFetching}
            updatedAt={snapshot.data ? snapshot.dataUpdatedAt : undefined}
            onRefresh={() => {
              void refreshAll();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          {/* KPI strip */}
          {snapshot.isError ? (
            <EmptyState
              icon={<BarChart3 className="size-6" aria-hidden />}
              title="Could not load your figures"
              description="Something went wrong reaching the server. Try again in a moment."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void snapshot.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 @md:grid-cols-3 @2xl:grid-cols-4">
              <KpiTile
                label="Customers"
                value={s ? s.customers.toLocaleString() : '—'}
                onOpen={go('crm.customers.list')}
              />
              <KpiTile
                label="Wholesale accounts"
                value={s ? s.companies.toLocaleString() : '—'}
                onOpen={go('crm.accounts.list')}
              />
              <KpiTile
                label="Open deals"
                value={s ? s.openDeals.toLocaleString() : '—'}
                onOpen={go('crm.deals.list')}
              />
              <KpiTile
                label="Pipeline value"
                value={s ? formatMoney(s.pipelineValue) : '—'}
                onOpen={go('crm.deals.list')}
              />
              <KpiTile
                label="Open tasks"
                value={s ? s.openTasks.toLocaleString() : '—'}
                onOpen={go('crm.tasks.list')}
              />
              <KpiTile
                label="Overdue tasks"
                value={s ? s.overdueTasks.toLocaleString() : '—'}
                alarm={(s?.overdueTasks ?? 0) > 0}
                onOpen={go('crm.tasks.list')}
              />
              <KpiTile
                label="Active segments"
                value={s ? s.activeSegments.toLocaleString() : '—'}
                onOpen={go('crm.segments.list')}
              />
            </div>
          )}

          <div className="grid gap-4 @3xl:grid-cols-2">
            {/* New customers per month */}
            <Panel
              title="New customers a month"
              action={<PanelLink label="Everyone" onOpen={go('crm.customers.list')} />}
            >
              {acquisition.isPending ? (
                <Loading />
              ) : !acqHasData ? (
                <Empty>No new customers in this period yet.</Empty>
              ) : (
                <AcquisitionChart points={acqPoints} />
              )}
            </Panel>

            {/* Task health */}
            <Panel
              title="Tasks"
              action={<PanelLink label="All tasks" onOpen={go('crm.tasks.list')} />}
            >
              {tasks.isPending ? (
                <Loading />
              ) : tasks.data ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <KpiTile label="To do" value={tasks.data.open.toLocaleString()} />
                    <KpiTile
                      label="Overdue"
                      value={tasks.data.overdue.toLocaleString()}
                      alarm={tasks.data.overdue > 0}
                    />
                    <KpiTile label="Due today" value={tasks.data.dueToday.toLocaleString()} />
                    <KpiTile
                      label="Done (30 days)"
                      value={tasks.data.completedLast30d.toLocaleString()}
                    />
                  </div>
                  {/* Four urgencies that all render the same grey would say the
                      same thing four times. The color IS the urgency — and
                      only when there is something at it, because "Urgent: 0"
                      in red is a warning about nothing. */}
                  <div className="flex flex-wrap gap-2">
                    {PRIORITY_BANDS.map(({ key, label, tone }) => {
                      const count = tasks.data.byPriority[key];
                      return (
                        <Badge
                          key={key}
                          color={count > 0 ? tone : 'neutral'}
                          variant="soft"
                          size="sm"
                        >
                          {label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                </>
              ) : (
                <Empty>No task figures yet.</Empty>
              )}
            </Panel>

            {/* Pipeline funnel */}
            <Panel
              title="Pipeline"
              action={
                (pipelines?.items.length ?? 0) > 0 ? (
                  <div className="flex min-w-0 items-center gap-1">
                    <div className="w-44">
                      <Select
                        size="sm"
                        color="module"
                        aria-label="Which pipeline"
                        value={activePipeline ?? ''}
                        items={Object.fromEntries(
                          (pipelines?.items ?? []).map((p) => [p.id, p.name])
                        )}
                        onValueChange={(next) => {
                          setPipelineId(next as string);
                        }}
                      />
                    </div>
                    {activePipeline ? (
                      <PanelLink
                        label="Open it"
                        onOpen={go('crm.pipeline.detail', { id: activePipeline })}
                      />
                    ) : null}
                  </div>
                ) : null
              }
            >
              {!activePipeline ? (
                <Empty>Create a pipeline to see its funnel.</Empty>
              ) : funnel.isPending ? (
                <Loading />
              ) : (funnel.data?.length ?? 0) === 0 ? (
                <Empty>This pipeline has no stages yet.</Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {funnel.data?.map((b) => (
                    <ProportionRow
                      key={b.stageId}
                      label={b.stageName}
                      value={b.count}
                      peak={funnelPeak}
                      trailing={`${b.count.toLocaleString()} · ${formatMoney(b.totalValue)}`}
                    />
                  ))}
                </div>
              )}
            </Panel>

            {/* Win / loss */}
            <Panel
              title="Won and lost, by person"
              action={<PanelLink label="All deals" onOpen={go('crm.deals.list')} />}
            >
              {winLoss.isPending ? (
                <Loading />
              ) : (winLoss.data?.length ?? 0) === 0 ? (
                <Empty>No closed deals to compare yet.</Empty>
              ) : (
                <ul className="divide-base-300 flex flex-col divide-y">
                  {winLoss.data?.map((row) => (
                    <li
                      key={row.repId ?? 'unassigned'}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {row.repId ? (repName.get(row.repId) ?? 'A team member') : 'Unassigned'}
                      </span>
                      <Badge color="success" variant="soft" size="sm">
                        {row.won} won
                      </Badge>
                      <Badge color="danger" variant="soft" size="sm">
                        {row.lost} lost
                      </Badge>
                      <Badge color={winRateTone(row.winRate)} variant="soft" size="sm">
                        {Math.round(row.winRate * 100)}% win rate
                      </Badge>
                      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {formatMoney(row.totalWonValue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            {/* Leads by source */}
            <Panel title="Where new customers come from">
              {leads.isPending ? (
                <Loading />
              ) : (leads.data?.bySource.length ?? 0) === 0 ? (
                <Empty>No new customers in this period yet.</Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  <Text className="text-sm">{leads.data?.rangeLabel}</Text>
                  {leads.data?.bySource.map((row) => (
                    <ProportionRow
                      key={row.source}
                      label={row.label}
                      value={row.count}
                      peak={leadPeak}
                      trailing={`${row.count.toLocaleString()} · ${row.sharePct}%`}
                    />
                  ))}
                </div>
              )}
            </Panel>

            {/* Segments */}
            <Panel
              title="Audiences by size"
              action={<PanelLink label="All audiences" onOpen={go('crm.segments.list')} />}
            >
              {segments.isPending ? (
                <Loading />
              ) : (segments.data?.segments.length ?? 0) === 0 ? (
                <Empty>No segments yet.</Empty>
              ) : (
                <div className="flex flex-col gap-3">
                  {segments.data?.segments.map((row) => (
                    <ProportionRow
                      key={row.id}
                      label={row.name}
                      value={row.memberCount}
                      peak={segPeak}
                      trailing={row.memberCount.toLocaleString()}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
