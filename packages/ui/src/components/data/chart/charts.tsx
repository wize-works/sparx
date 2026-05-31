'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  BarChart as RBarChart,
  Bar,
  AreaChart as RAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { cn } from '../../../utils/cn';
import {
  type ChartSeries,
  type ValueFormatter,
  resolveSeriesColor,
  AXIS_TICK,
  AXIS_LINE,
  GRID_STROKE,
  ChartTooltipContent,
  ChartLegendContent,
} from './chart-utils';

export type { ChartSeries } from './chart-utils';

// Opinionated, token-themed chart components (docs/34 §15) built on Recharts.
// Recharts itself never leaves this package — feature code passes plain
// `data` + `series` and gets light/dark + active-module theming for free, the
// same contract the rest of @sparx/ui follows for Radix.

export interface BaseChartProps {
  /** Row-per-category data. Each datum holds the x value + one field per series. */
  data: readonly Record<string, unknown>[];
  /** Series to plot. Color defaults to the categorical palette by position. */
  series: ChartSeries[];
  /** Datum key for the X axis (category or time). */
  xKey: string;
  /** Plot height in px (the chart is width-responsive). Default 240. */
  height?: number;
  showGrid?: boolean;
  /** Show the legend. Defaults to true when there's more than one series. */
  showLegend?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  /** Format Y-axis ticks + tooltip values (e.g. currency). */
  valueFormatter?: ValueFormatter;
  /** Format X-axis tick labels (e.g. short dates). */
  xTickFormatter?: (value: string | number) => string;
  className?: string;
  /** Accessible label for the chart region. */
  ariaLabel?: string;
}

function yTickFormatter(f?: ValueFormatter) {
  return f ? (value: string | number) => f(Number(value)) : undefined;
}

function ChartFrame({
  height = 240,
  ariaLabel,
  className,
  children,
}: {
  height?: number;
  ariaLabel?: string;
  className?: string;
  children: React.ReactElement;
}) {
  return (
    <div role="img" aria-label={ariaLabel} className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;
const TOOLTIP_CURSOR = { stroke: 'var(--color-border-strong)', strokeWidth: 1 } as const;

// ── Line ───────────────────────────────────────────────────

export interface LineChartProps extends BaseChartProps {
  /** Smooth (monotone) lines vs straight segments. Default true. */
  curved?: boolean;
}

export function LineChart({
  data,
  series,
  xKey,
  height,
  showGrid = true,
  showLegend,
  showXAxis = true,
  showYAxis = true,
  valueFormatter,
  xTickFormatter,
  curved = true,
  className,
  ariaLabel,
}: LineChartProps) {
  const legend = showLegend ?? series.length > 1;
  return (
    <ChartFrame height={height} ariaLabel={ariaLabel} className={className}>
      <RLineChart data={data} margin={CHART_MARGIN}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />}
        {showXAxis && (
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickMargin={8}
            tickFormatter={xTickFormatter}
          />
        )}
        {showYAxis && (
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={yTickFormatter(valueFormatter)}
          />
        )}
        <Tooltip
          content={<ChartTooltipContent valueFormatter={valueFormatter} />}
          cursor={TOOLTIP_CURSOR}
        />
        {legend && <Legend content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <Line
            key={s.key}
            type={curved ? 'monotone' : 'linear'}
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={resolveSeriesColor(s.color, i)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        ))}
      </RLineChart>
    </ChartFrame>
  );
}

// ── Bar ────────────────────────────────────────────────────

export interface BarChartProps extends BaseChartProps {
  /** Stack series into one bar instead of grouping side-by-side. */
  stacked?: boolean;
}

export function BarChart({
  data,
  series,
  xKey,
  height,
  showGrid = true,
  showLegend,
  showXAxis = true,
  showYAxis = true,
  valueFormatter,
  xTickFormatter,
  stacked = false,
  className,
  ariaLabel,
}: BarChartProps) {
  const legend = showLegend ?? series.length > 1;
  return (
    <ChartFrame height={height} ariaLabel={ariaLabel} className={className}>
      <RBarChart data={data} margin={CHART_MARGIN}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />}
        {showXAxis && (
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickMargin={8}
            tickFormatter={xTickFormatter}
          />
        )}
        {showYAxis && (
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={yTickFormatter(valueFormatter)}
          />
        )}
        <Tooltip
          content={<ChartTooltipContent valueFormatter={valueFormatter} />}
          cursor={{ fill: 'var(--color-bg-subtle)' }}
        />
        {legend && <Legend content={<ChartLegendContent />} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            fill={resolveSeriesColor(s.color, i)}
            stackId={stacked ? 'stack' : undefined}
            radius={stacked ? 0 : [4, 4, 0, 0]}
            isAnimationActive={false}
          />
        ))}
      </RBarChart>
    </ChartFrame>
  );
}

// ── Area ───────────────────────────────────────────────────

export interface AreaChartProps extends BaseChartProps {
  curved?: boolean;
  stacked?: boolean;
}

export function AreaChart({
  data,
  series,
  xKey,
  height,
  showGrid = true,
  showLegend,
  showXAxis = true,
  showYAxis = true,
  valueFormatter,
  xTickFormatter,
  curved = true,
  stacked = false,
  className,
  ariaLabel,
}: AreaChartProps) {
  const legend = showLegend ?? series.length > 1;
  const gradientId = React.useId();
  return (
    <ChartFrame height={height} ariaLabel={ariaLabel} className={className}>
      <RAreaChart data={data} margin={CHART_MARGIN}>
        <defs>
          {series.map((s, i) => {
            const color = resolveSeriesColor(s.color, i);
            return (
              <linearGradient key={s.key} id={`${gradientId}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />}
        {showXAxis && (
          <XAxis
            dataKey={xKey}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickMargin={8}
            tickFormatter={xTickFormatter}
          />
        )}
        {showYAxis && (
          <YAxis
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={yTickFormatter(valueFormatter)}
          />
        )}
        <Tooltip
          content={<ChartTooltipContent valueFormatter={valueFormatter} />}
          cursor={TOOLTIP_CURSOR}
        />
        {legend && <Legend content={<ChartLegendContent />} />}
        {series.map((s, i) => {
          const color = resolveSeriesColor(s.color, i);
          return (
            <Area
              key={s.key}
              type={curved ? 'monotone' : 'linear'}
              dataKey={s.key}
              name={s.label ?? s.key}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId}-${i})`}
              stackId={stacked ? 'stack' : undefined}
              isAnimationActive={false}
            />
          );
        })}
      </RAreaChart>
    </ChartFrame>
  );
}
