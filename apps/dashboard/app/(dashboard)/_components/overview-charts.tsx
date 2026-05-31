'use client';

import * as React from 'react';
import {
  AreaChart,
  BarChart,
  LineChart,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type ChartSeries,
} from '@sparx/ui';

// Overview dashboard charts (docs/34 §10). The chart primitives are token-themed
// and the hero series defaults to the active module's color (set by each
// module layout's <ModuleProvider>), so a Commerce chart is orange, CRM cyan, etc.
//
// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA: every dataset below is illustrative, NOT live. It exists so the
// dashboard design is reviewable before reporting timeseries endpoints exist.
// When `/v1/<module>/reports/*-timeseries` lands, pass real `data` into
// <OverviewChartCard> and drop `sample` (which hides the "Sample data" badge).
// Search this file for SAMPLE_ to find everything that must be replaced.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_NOTE =
  'Illustrative sample data — live metrics appear once reporting timeseries endpoints land.';

type Format = 'currency' | 'number' | 'percent' | 'compact';

export interface TrendPoint {
  label: string;
  [series: string]: string | number;
}

export interface OverviewChartCardProps {
  title: string;
  description?: string;
  data: TrendPoint[];
  series: ChartSeries[];
  xKey?: string;
  type?: 'area' | 'bar' | 'line';
  format?: Format;
  height?: number;
  /** Show the "Sample data" badge. Default true. Set false once data is live. */
  sample?: boolean;
}

function makeFormatter(format: Format): (value: number) => string {
  switch (format) {
    case 'currency':
      return (v) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(v);
    case 'percent':
      return (v) => `${v.toFixed(1)}%`;
    case 'compact':
      return (v) => new Intl.NumberFormat('en-US', { notation: 'compact' }).format(v);
    case 'number':
    default:
      return (v) => new Intl.NumberFormat('en-US').format(v);
  }
}

export function SampleBadge() {
  return (
    <Badge color="warning" variant="soft" title={SAMPLE_NOTE}>
      Sample data
    </Badge>
  );
}

export function OverviewChartCard({
  title,
  description,
  data,
  series,
  xKey = 'label',
  type = 'area',
  format = 'number',
  height = 220,
  sample = true,
}: OverviewChartCardProps) {
  const valueFormatter = makeFormatter(format);
  const chartProps = {
    data,
    series,
    xKey,
    height,
    valueFormatter,
    ariaLabel: title,
  };
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {sample && <SampleBadge />}
        </div>
      </CardHeader>
      <CardContent>
        {type === 'bar' ? (
          <BarChart {...chartProps} />
        ) : type === 'line' ? (
          <LineChart {...chartProps} />
        ) : (
          <AreaChart {...chartProps} />
        )}
      </CardContent>
    </Card>
  );
}

// ── Sample datasets ─────────────────────────────────────────
// Plausible-but-fake series. Replace with live reporting data; do not ship as
// real metrics. Labels are short so axes stay legible.

export const SAMPLE_REVENUE_14D: TrendPoint[] = [
  { label: 'May 17', revenue: 8120, orders: 31 },
  { label: 'May 18', revenue: 9340, orders: 37 },
  { label: 'May 19', revenue: 7610, orders: 28 },
  { label: 'May 20', revenue: 10980, orders: 42 },
  { label: 'May 21', revenue: 12450, orders: 49 },
  { label: 'May 22', revenue: 11230, orders: 44 },
  { label: 'May 23', revenue: 9870, orders: 38 },
  { label: 'May 24', revenue: 8650, orders: 33 },
  { label: 'May 25', revenue: 13420, orders: 52 },
  { label: 'May 26', revenue: 14110, orders: 55 },
  { label: 'May 27', revenue: 12880, orders: 50 },
  { label: 'May 28', revenue: 15240, orders: 61 },
  { label: 'May 29', revenue: 16030, orders: 64 },
  { label: 'May 30', revenue: 14760, orders: 58 },
];

export const SAMPLE_CRM_PIPELINE: TrendPoint[] = [
  { label: 'Lead', deals: 142 },
  { label: 'Qualified', deals: 98 },
  { label: 'Proposal', deals: 54 },
  { label: 'Negotiation', deals: 31 },
  { label: 'Won', deals: 19 },
];

export const SAMPLE_CRM_GROWTH_12W: TrendPoint[] = [
  { label: 'W1', customers: 1240, new: 42 },
  { label: 'W2', customers: 1288, new: 48 },
  { label: 'W3', customers: 1331, new: 43 },
  { label: 'W4', customers: 1389, new: 58 },
  { label: 'W5', customers: 1437, new: 48 },
  { label: 'W6', customers: 1502, new: 65 },
  { label: 'W7', customers: 1559, new: 57 },
  { label: 'W8', customers: 1618, new: 59 },
  { label: 'W9', customers: 1690, new: 72 },
  { label: 'W10', customers: 1751, new: 61 },
  { label: 'W11', customers: 1828, new: 77 },
  { label: 'W12', customers: 1902, new: 74 },
];

export const SAMPLE_EMAIL_ENGAGEMENT_8W: TrendPoint[] = [
  { label: 'W1', open: 41.2, click: 4.1 },
  { label: 'W2', open: 43.8, click: 4.6 },
  { label: 'W3', open: 39.5, click: 3.8 },
  { label: 'W4', open: 45.1, click: 5.0 },
  { label: 'W5', open: 47.3, click: 5.4 },
  { label: 'W6', open: 44.0, click: 4.7 },
  { label: 'W7', open: 48.6, click: 5.9 },
  { label: 'W8', open: 50.2, click: 6.2 },
];

export const SAMPLE_CMS_PUBLISHING_8W: TrendPoint[] = [
  { label: 'W1', published: 4, drafts: 7 },
  { label: 'W2', published: 6, drafts: 5 },
  { label: 'W3', published: 3, drafts: 8 },
  { label: 'W4', published: 8, drafts: 6 },
  { label: 'W5', published: 5, drafts: 9 },
  { label: 'W6', published: 9, drafts: 4 },
  { label: 'W7', published: 7, drafts: 6 },
  { label: 'W8', published: 11, drafts: 5 },
];
