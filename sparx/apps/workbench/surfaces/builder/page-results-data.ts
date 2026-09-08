'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE PAGE-RESULTS DATA LAYER
//
// One question: did the page you built do anything? The answer is a join across
// four modules that api-rest assembles (`lib/page-performance.ts`) and this
// module reads — site analytics for traffic and real-user load time, commerce
// for the revenue attributed to landing there, the SEO module for the stored
// search grade. Nothing is computed here; the numbers arrive settled, so the
// screen and any other consumer cannot disagree about what a conversion rate is.
//
// SCOPED TO THE ACTIVE SITE, always. The endpoint takes the working site from the
// `x-sparx-property-id` header. A tenant with two unrelated businesses must never
// see one site's revenue against the other's home page.
// ══════════════════════════════════════════════════════════════════════════

import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';

/* ── Shapes (mirrors PagePerformanceReport in api-rest) ─────────────────── */

export interface PageResultRow {
  pageId: string;
  name: string;
  /** The path as authored. For a collection template this is the template's own
   *  address, NOT where visitors land — `pathPrefix` is. */
  path: string;
  /** Set only for a template that renders many records: the route those records
   *  are served under. Its figures are the sum of every path beneath it. */
  pathPrefix: string | null;
  /** How many separate addresses the figures cover — 1 for an ordinary page, and
   *  for a template, how many of its records anyone actually visited. */
  pathsCovered: number;
  views: number;
  visitors: number;
  orders: number;
  revenueCents: number;
  /** Orders per visitor as a percentage. NULL when nobody came — a page with no
   *  visitors has no conversion rate, and 0% would read as failure. */
  conversionPct: number | null;
  /** Average real-user load time in ms, over `loadSamples` measurements. Null when
   *  no visitor's browser reported one; never render null as fast. */
  loadMs: number | null;
  loadSamples: number;
  seoScore: number | null;
  seoGrade: string | null;
  seoFixFirst: string | null;
  noindex: boolean;
}

/** Traffic on an address no page in the editor owns — a product, a post, a legal
 *  page. Present so the totals reconcile with the traffic card. */
export interface UnownedPathRow {
  path: string;
  views: number;
  visitors: number;
  orders: number;
  revenueCents: number;
}

/** Sales in this window, and how many of them could be tied to a page. */
export interface AttributionCoverage {
  placed: number;
  traced: number;
}

export interface PageResultsReport {
  range: { from: string; to: string };
  pages: PageResultRow[];
  otherPaths: UnownedPathRow[];
  /** False when Commerce is off — the money columns are hidden rather than shown
   *  permanently empty. */
  commerce: boolean;
  attribution: AttributionCoverage;
  totals: { views: number; visitors: number; orders: number; revenueCents: number };
}

/**
 * Sales happened, and not one of them could be tied to a page.
 *
 * A row's Bought column counts orders whose buyer's first pageview THAT DAY was on
 * that page, so when nothing was traceable every row reads `0 (0%)` — and an owner
 * who took fourteen orders is told that not one page she built sold anything. That
 * is the difference between a measurement and an absence, and it must not be
 * rendered as the former. Same rule the conversion rate already follows: a page with
 * no visitors gets no percentage rather than 0%.
 */
export function salesUntraced(report: PageResultsReport): boolean {
  return report.commerce && report.attribution.placed > 0 && report.attribution.traced === 0;
}

/* ── Reading ────────────────────────────────────────────────────────────── */

/** The windows worth offering. Shorter than a week is noise on most sites; longer
 *  than a quarter stops being about anything the owner recently changed. */
export const RESULT_WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
] as const;

export type ResultWindow = (typeof RESULT_WINDOWS)[number]['days'];

export const PAGE_RESULTS_KEY = ['builder', 'analytics', 'pages'] as const;

/**
 * How every page of the active site is doing over the last `days`.
 *
 * The window is sent as an explicit `from`, computed here rather than left to the
 * server's default, so the number on screen and the label above it always describe
 * the same period.
 */
export function usePageResults(days: ResultWindow) {
  const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString();
  return useQuery({
    queryKey: [...PAGE_RESULTS_KEY, days],
    queryFn: () =>
      api.get<PageResultsReport>(`/v1/builder/analytics/pages?from=${encodeURIComponent(from)}`),
    // Traffic figures are hours-fresh at best; refetching them on every focus
    // would spend a full four-module join to redraw the same numbers.
    staleTime: 60_000,
  });
}

/* ── Reading the numbers out loud ───────────────────────────────────────── */

const NUMBER = new Intl.NumberFormat();

export function formatCount(value: number): string {
  return NUMBER.format(value);
}

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

/** Load time as a person would say it. Seconds past one second, because "2.4
 *  seconds" lands and "2412 ms" does not. */
export function formatLoad(ms: number | null): string {
  if (ms == null) return 'Not measured';
  if (ms < 1000) return `${String(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} seconds`;
}

/**
 * How a load time reads, as a status color.
 *
 * The thresholds are the widely-used web-vitals bands (2.5 s good, 4 s poor), and
 * an UNMEASURED page is `neutral` rather than good — the one thing this must not do
 * is paint "we have no idea" the same color as "fast".
 */
export function loadTone(ms: number | null): 'success' | 'warning' | 'error' | 'neutral' {
  if (ms == null) return 'neutral';
  if (ms <= 2500) return 'success';
  if (ms <= 4000) return 'warning';
  return 'error';
}

/** The search grade's color, on the SEO module's own 0–100 scale. */
export function seoTone(score: number | null): 'success' | 'warning' | 'error' | 'neutral' {
  if (score == null) return 'neutral';
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'error';
}
