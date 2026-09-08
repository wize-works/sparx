'use client';

// Activity & reports — how the whole rule engine is doing, rather than any one
// rule. The question it answers is "are my automations working, and which ones
// are pulling their weight?": a day-by-day run count, an overall success rate,
// and a table of every rule ranked by how much it runs and how reliably.
//
// The chart is drawn from layout utilities with bar heights quantised to literal
// Tailwind classes — no inline style, no charting dependency to draw a row of
// bars (matches sites/traffic.tsx and dropship/profitability.tsx).

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Select,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Text,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { BarChart3, LineChart, ServerCrash } from 'lucide-react';
import { RefreshButton } from '../../components/refresh-button';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { automationState, summarizeTrigger } from './automations-presentation';
import {
  automationErrorMessage,
  presetRange,
  RANGE_LABEL,
  useAutomationsSummary,
  useRunsTimeseries,
  type AutomationOverviewRow,
  type RangePreset,
  type RunsTimeseriesPoint,
} from './automations-data';

const NUMBER = new Intl.NumberFormat();

const BAR_HEIGHT = [
  'h-px',
  'h-[5%]',
  'h-[10%]',
  'h-[15%]',
  'h-[20%]',
  'h-[25%]',
  'h-[30%]',
  'h-[35%]',
  'h-[40%]',
  'h-[45%]',
  'h-[50%]',
  'h-[55%]',
  'h-[60%]',
  'h-[65%]',
  'h-[70%]',
  'h-[75%]',
  'h-[80%]',
  'h-[85%]',
  'h-[90%]',
  'h-[95%]',
  'h-full',
];

function RunBars({ points }: { points: RunsTimeseriesPoint[] }) {
  const peak = Math.max(1, ...points.map((p) => p.runsCount));
  return (
    <div className="flex h-20 items-end gap-0.5" role="img" aria-label="Runs each day">
      {points.map((point) => {
        const label = new Date(point.bucket).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        });
        const step = point.runsCount === 0 ? 0 : Math.round((point.runsCount / peak) * 20);
        const hasFailures = point.failedCount > 0;
        return (
          <Tooltip
            key={point.bucket}
            delay={100}
            content={`${label} · ${
              point.runsCount === 1 ? '1 run' : `${NUMBER.format(point.runsCount)} runs`
            }${point.failedCount > 0 ? ` · ${NUMBER.format(point.failedCount)} failed` : ''}`}
          >
            <div
              className={`flex-1 rounded-sm ${hasFailures ? 'bg-warning' : 'bg-module'} ${BAR_HEIGHT[step] ?? 'h-px'}`}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}

function OverviewRow({
  row,
  onOpen,
}: {
  row: AutomationOverviewRow;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = automationState(row.status);
  const pct = row.successRate === null ? null : Math.round(row.successRate * 100);
  return (
    <button
      type="button"
      className="border-base-300 hover:bg-base-200 flex w-full min-w-0 cursor-pointer flex-col gap-1 border-b px-1 py-2.5 text-left last:border-b-0"
      onClick={onOpen}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <Text as="span" className="min-w-0 flex-1 text-sm">
          {summarizeTrigger(row.triggerType, {})}
        </Text>
        <Text as="span" className="shrink-0 text-sm tabular-nums">
          {row.runs === 0
            ? 'No runs'
            : row.runs === 1
              ? '1 run'
              : `${NUMBER.format(row.runs)} runs`}
        </Text>
        {pct !== null ? (
          <Badge
            color={pct >= 90 ? 'success' : pct >= 70 ? 'warning' : 'danger'}
            variant="soft"
            size="sm"
          >
            {pct}% ok
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function AutomationsReportsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [preset, setPreset] = useState<RangePreset>('30');
  const [scope, setScope] = useState<'this' | 'all'>('this');
  const range = useMemo(() => presetRange(preset, scope), [preset, scope]);

  const series = useRunsTimeseries(range);
  const summary = useAutomationsSummary();

  const isFetching = series.isFetching || summary.isFetching;
  const refetchAll = () => {
    void series.refetch();
    void summary.refetch();
  };

  const rows = useMemo(
    () => [...(summary.data ?? [])].sort((a, b) => b.runs - a.runs),
    [summary.data]
  );

  const totals = series.data?.totals;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Automations report controls"
        controls={
          <>
            <BarChart3 className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              Activity &amp; reports
            </Heading>
            <div className="ml-auto w-32 shrink-0">
              <Select
                size="sm"
                color="module"
                aria-label="Which businesses"
                value={scope}
                items={{ this: 'This business', all: 'All businesses' }}
                onValueChange={(next) => {
                  setScope((next as 'this' | 'all') || 'this');
                }}
              />
            </div>
            <div className="w-36 shrink-0">
              <Select
                size="sm"
                color="module"
                aria-label="Time period"
                value={preset}
                items={{ '7': RANGE_LABEL['7'], '30': RANGE_LABEL['30'], '90': RANGE_LABEL['90'] }}
                onValueChange={(next) => {
                  setPreset((next as RangePreset) || '30');
                }}
              />
            </div>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={series.data ? series.dataUpdatedAt : undefined}
            onRefresh={refetchAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {series.isError && summary.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load the report"
              description={automationErrorMessage(
                series.error ?? summary.error,
                'This is a problem reaching the server. Try again in a moment.'
              )}
              actions={
                <Button size="sm" color="module" onClick={refetchAll}>
                  Try again
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Heading level={1} className="text-2xl font-semibold">
                  {RANGE_LABEL[preset]}
                </Heading>
                <Text className="text-sm">
                  How often your automations ran, and how reliably. A skipped run means the
                  conditions no longer matched — it is not counted against the success rate.
                </Text>
              </div>

              <Stats className="w-full">
                <Stat>
                  <StatTitle>Runs</StatTitle>
                  <StatValue>{NUMBER.format(totals?.runsCount ?? 0)}</StatValue>
                  <StatDesc>times a rule fired</StatDesc>
                </Stat>
                <Stat>
                  <StatTitle>Success rate</StatTitle>
                  <StatValue>{totals ? `${String(totals.successRate)}%` : '—'}</StatValue>
                  <StatDesc>finished without failing</StatDesc>
                </Stat>
                <Stat>
                  <StatTitle>Failed</StatTitle>
                  <StatValue>{NUMBER.format(totals?.failedCount ?? 0)}</StatValue>
                  <StatDesc>runs that hit a problem</StatDesc>
                </Stat>
              </Stats>

              <FormSection title="Runs day by day">
                {series.isPending ? (
                  <Text className="text-sm" role="status">
                    Loading…
                  </Text>
                ) : series.data && series.data.points.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <RunBars points={series.data.points} />
                    <Text className="text-sm">
                      One bar per day, tallest being the most runs. An amber bar is a day something
                      failed. Hover a bar for its figures.
                    </Text>
                  </div>
                ) : (
                  <Text className="text-sm">No runs in this period.</Text>
                )}
              </FormSection>

              <FormSection
                title="By automation"
                description="Every rule you have, busiest first. Click one to open it."
              >
                {summary.isPending ? (
                  <Text className="text-sm" role="status">
                    Loading…
                  </Text>
                ) : rows.length === 0 ? (
                  <EmptyState
                    icon={<LineChart className="size-6" aria-hidden />}
                    title="No automations yet"
                    description="Once you create rules, they show up here with how much they run and how reliably."
                  />
                ) : (
                  <div className="flex flex-col">
                    {rows.map((row) => (
                      <OverviewRow
                        key={row.id}
                        row={row}
                        onOpen={(event) => {
                          ctx.open(
                            'automations.detail',
                            { id: row.id },
                            { target: targetFor(event) }
                          );
                        }}
                      />
                    ))}
                  </div>
                )}
              </FormSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
