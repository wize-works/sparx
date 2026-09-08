'use client';

// One page's scorecard — how well it is set up to be found, and exactly what to
// fix first.
//
// A READ-ONLY detail pane, not a form: there is nothing to save here. The score
// is recomputed fresh every time this opens (the live-audit endpoint re-scores
// and re-stores), so the number is always current even when the list it was
// opened from is a little stale — and "check again" is just a refetch.
//
// It is a pane, not a modal, for the ordinary reasons: it is a durable thing you
// return to and deep-link, comparing two pages' checks side by side is useful,
// and it wants to sit BESIDE the list it came from.
//
// Deliberately NOT EditorLayout: there is no form and no running summary to put
// in a rail. One centred column — the page's identity at the top, the single
// most worthwhile fix as a callout, the score broken down, then the checks split
// into "worth fixing" and "already good".

import { useEffect, useMemo } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Heading,
  Text,
} from '@wizeworks/silicaui-react';
import { CheckCircle2, Lightbulb } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  checkStatusLabel,
  checkTone,
  entityLabel,
  gradeLabel,
  scoreTone,
  type AuditCategory,
  type AuditCheck,
  type EntityType,
  type Scorecard,
  type Tone,
  useAudit,
} from './data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const VALID_TYPES: EntityType[] = ['builder_page', 'cms_page', 'product', 'collection'];

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

function ScoreCard({ card }: { card: Scorecard }) {
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

function CategoryBar({ category }: { category: AuditCategory }) {
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

function CheckRow({ check }: { check: AuditCheck }) {
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

/* ── The surface ─────────────────────────────────────────────────────────── */

function AuditDetail({ ctx, type, id }: { ctx: SurfaceContext; type: EntityType; id: string }) {
  const { data: card, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAudit(type, id);

  const worthFixing = useMemo(
    () => (card?.checks ?? []).filter((c) => c.status === 'warn' || c.status === 'fail'),
    [card]
  );
  const alreadyGood = useMemo(
    () => (card?.checks ?? []).filter((c) => c.status === 'pass' || c.status === 'info'),
    [card]
  );

  useEffect(() => {
    if (card) ctx.setTitle('Page check');
  }, [ctx, card]);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Page check actions"
        controls={
          <>
            {card ? (
              <Badge color={scoreTone(card.grade)} variant="soft" size="sm">
                {card.score} / 100 · {gradeLabel(card.grade)}
              </Badge>
            ) : null}
            {/* ALWAYS the last child — a fresh read here re-scores the page, so this
            IS "check again". Carries ml-auto as the only right-hand control. */}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={card ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <div className="flex h-full items-center justify-center p-8">
            <Alert color="error" className="max-w-md">
              <AlertContent>
                <AlertTitle>Could not score this page</AlertTitle>
                <AlertDescription>
                  This is a problem reaching the server, or the page no longer exists. Nothing about
                  the page itself has changed.
                </AlertDescription>
              </AlertContent>
            </Alert>
          </div>
        ) : isPending || !card ? (
          <p className="p-4 text-sm" role="status">
            Scoring this page…
          </p>
        ) : (
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold break-words">
                {ctx.params.title && typeof ctx.params.title === 'string'
                  ? ctx.params.title
                  : entityLabel(card.entityType)}
              </Heading>
              <Text className="text-sm">
                {entityLabel(card.entityType)}
                {ctx.params.path && typeof ctx.params.path === 'string'
                  ? ` · ${ctx.params.path}`
                  : ''}
              </Text>
            </div>

            <ScoreCard card={card} />

            {/* The single highest-leverage fix, front and centre. When nothing is
                wrong the engine returns null, and we say so with a success note
                rather than a hollow prompt. */}
            {card.fixFirst ? (
              <Alert color="info">
                <Lightbulb className="size-5" aria-hidden />
                <AlertContent>
                  <AlertTitle>Fix this first</AlertTitle>
                  <AlertDescription>{card.fixFirst}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <Alert color="success" variant="soft">
                <CheckCircle2 className="size-5" aria-hidden />
                <AlertContent>
                  <AlertTitle>Nothing to fix</AlertTitle>
                  <AlertDescription>
                    Every check on this page is in good shape. There is nothing here that needs your
                    attention.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}

            <section className="card bg-base-100 flex flex-col gap-3 p-4">
              <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
                <Heading level={2} className="text-lg font-semibold">
                  Where the score comes from
                </Heading>
                <Text className="text-sm">
                  Four areas make up the score. The fuller each bar, the better this page is doing
                  in that area.
                </Text>
              </div>
              <div className="grid gap-3 @md:grid-cols-2">
                {card.categories.map((category) => (
                  <CategoryBar key={category.key} category={category} />
                ))}
              </div>
            </section>

            {worthFixing.length > 0 ? (
              <section className="card bg-base-100 flex flex-col gap-2 p-4">
                <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
                  <Heading level={2} className="text-lg font-semibold">
                    Worth fixing
                  </Heading>
                  <Text className="text-sm">
                    Each of these would help this page be found. Start at the top.
                  </Text>
                </div>
                <ul>
                  {worthFixing.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </ul>
              </section>
            ) : null}

            {alreadyGood.length > 0 ? (
              <section className="card bg-base-100 flex flex-col gap-2 p-4">
                <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
                  <Heading level={2} className="text-lg font-semibold">
                    Already good
                  </Heading>
                  <Text className="text-sm">Nothing to do here — these are set up correctly.</Text>
                </div>
                <ul>
                  {alreadyGood.map((check) => (
                    <CheckRow key={check.id} check={check} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const type = typeof ctx.params.type === 'string' ? ctx.params.type : '';
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';

  if (!VALID_TYPES.includes(type as EntityType) || !id) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert color="warning" className="max-w-md">
          <AlertContent>
            <AlertTitle>No page to show</AlertTitle>
            <AlertDescription>
              Open a page check from the Site checks list to see its breakdown here.
            </AlertDescription>
          </AlertContent>
        </Alert>
      </div>
    );
  }

  return <AuditDetail ctx={ctx} type={type as EntityType} id={id} />;
}
