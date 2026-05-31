'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  AreaChart as RAreaChart,
  Area,
  LineChart as RLineChart,
  Line,
} from 'recharts';
import { cn } from '../../../utils/cn';
import { resolveSeriesColor } from './chart-utils';

// Sparkline — a tiny, axis-less trend line for inline use (Stat cards, table
// cells). No grid, axes, tooltip, or legend; just the shape of the trend. Like
// the full charts it themes off tokens — the default color is the active
// module's (`--module-active`).

export interface SparklineProps {
  /** Either an array of numbers, or objects keyed by `dataKey`. */
  data: readonly number[] | readonly Record<string, unknown>[];
  /** Key holding the value when `data` is objects. Default `'value'`. */
  dataKey?: string;
  /** `'module'`, a module key, or any CSS color. Default `'module'`. */
  color?: string;
  /** Height in px. Default 40. */
  height?: number;
  /** Line vs filled area. Default `'area'`. */
  variant?: 'line' | 'area';
  className?: string;
}

export function Sparkline({
  data,
  dataKey = 'value',
  color = 'module',
  height = 40,
  variant = 'area',
  className,
}: SparklineProps) {
  const gradientId = React.useId();
  const stroke = resolveSeriesColor(color, 0);

  const rows: Record<string, unknown>[] = React.useMemo(
    () =>
      data.length > 0 && typeof data[0] === 'number'
        ? (data as readonly number[]).map((value) => ({ [dataKey]: value }))
        : (data as readonly Record<string, unknown>[]).slice(),
    [data, dataKey]
  );

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {variant === 'area' ? (
          <RAreaChart data={rows} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </RAreaChart>
        ) : (
          <RLineChart data={rows} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </RLineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
