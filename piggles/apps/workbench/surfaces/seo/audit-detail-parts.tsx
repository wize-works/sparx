'use client';

// The read-only pieces one page's scorecard is drawn from: the big number, the
// four category bars, and one check row.
//
// Split out of `audit-detail.tsx` under RULE #0.5 when the pane gained a way to
// act on what it reports. They are presentation with no data access and no
// navigation — the surface owns both — which is what makes them safe to lift out
// whole rather than to divide the pane between two files that each know a little
// about the other.

import { Badge, Text } from '@wizeworks/silicaui-react';
import {
  checkStatusLabel,
  checkTone,
  gradeLabel,
  scoreTone,
  type AuditCategory,
  type AuditCheck,
  type Scorecard,
  type Tone,
} from './data';

/** A proportion as one of a fixed set of literal width classes — an inline
 *  `style={{ width }}` is banned, and on a short bar a 5% step is a pixel or two,
 *  below the threshold of noticing. */
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

function barWidthClass(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return BAR_WIDTH[0]!;
  const step = Math.round(Math.min(1, fraction) * 20);
  return BAR_WIDTH[step] ?? BAR_WIDTH[BAR_WIDTH.length - 1]!;
}

/* ── Score header ────────────────────────────────────────────────────────── */

// Literal per-tone ink classes — a `text-${tone}` template is invisible to the
// Tailwind compiler, so the color is spelled out.
const SCORE_INK: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

export function ScoreCard({ card }: { card: Scorecard }) {
  const tone = scoreTone(card.grade);
  return (
    <section className="card bg-base-100 flex flex-wrap items-center gap-4 p-4">
      <div className="flex flex-col">
        <span className={`text-5xl font-semibold tabular-nums ${SCORE_INK[tone]}`}>
          {card.score}
        </span>
        <Text className="text-sm">out of 100</Text>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Badge color={tone} variant="soft" size="sm" className="self-start">
          {gradeLabel(card.grade)}
        </Badge>
        <Text className="text-sm">
          {card.grade === 'excellent'
            ? 'This page is set up well for search. Keep it up.'
            : card.grade === 'good'
              ? 'This page is in good shape, with a little room to improve.'
              : card.grade === 'needs-work'
                ? 'A few changes here would make this page easier to find.'
                : 'This page is missing several things that help people find it.'}
        </Text>
      </div>
    </section>
  );
}

/* ── Category breakdown ──────────────────────────────────────────────────── */

export function CategoryBar({ category }: { category: AuditCategory }) {
  const fraction = category.max > 0 ? category.earned / category.max : 1;
  const pct = Math.round(fraction * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <Text className="text-sm font-medium">{category.label}</Text>
        <Text className="text-sm tabular-nums">{pct}%</Text>
      </div>
      <div className="bg-base-200 h-2 w-full overflow-hidden rounded-full">
        <div className={`bg-module h-full rounded-full ${barWidthClass(fraction)}`} />
      </div>
    </div>
  );
}

/* ── One check row ───────────────────────────────────────────────────────── */

export function CheckRow({ check }: { check: AuditCheck }) {
  return (
    <li className="border-base-300 flex flex-col gap-1 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={checkTone(check.status)} variant="soft" size="sm">
          {checkStatusLabel(check.status)}
        </Badge>
        <Text className="min-w-0 flex-1 font-medium">{check.label}</Text>
        {check.value ? <Text className="shrink-0 font-mono text-sm">{check.value}</Text> : null}
      </div>
      {check.tip ? <Text className="text-sm">{check.tip}</Text> : null}
    </li>
  );
}
