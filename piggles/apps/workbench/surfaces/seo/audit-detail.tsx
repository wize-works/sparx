'use client';

// One page's scorecard — how well it is set up to be found, exactly what to fix
// first, and the way to go and fix it.
//
// A READ-ONLY detail pane, not a form: there is nothing to save here. The score
// is recomputed fresh every time this opens (the live-audit endpoint re-scores
// and re-stores), so the number is always current even when the list it was
// opened from is a little stale — and "check again" is just a refetch.
//
// READ-ONLY IS NOT ACTIONLESS, which is what this pane got wrong. It listed
// eight specific things to change and offered no way to change any of them: its
// only two buttons were Refresh and Copy a link, and nothing in the body was
// interactive. The person had to carry the page's address in her head to My Site
// and find it again by hand (issue 392). The toolbar now carries ONE jump, to
// the editor that owns whatever was scored, wearing that module's hue —
// audit-fix-target.ts on the mapping and why the hue matters.
//
// It is a pane, not a modal, for the ordinary reasons: it is a durable thing you
// return to and deep-link, comparing two pages' checks side by side is useful,
// and it wants to sit BESIDE the list it came from.
//
// Deliberately NOT EditorLayout: there is no form and no running summary to put
// in a rail. Which page this is rides the TAB; the column is what kind of page
// and where it lives, the single most worthwhile fix as a callout, the score
// broken down, then the checks split into "worth fixing" and "already good".

import { useEffect, useMemo } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  Heading,
  Text,
} from '@wizeworks/silicaui-react';
import { faCircleCheck, faLightbulb } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { entityLabel, gradeLabel, scoreTone, type EntityType, useAudit } from './data';
import { CategoryBar, CheckRow, ScoreCard } from './audit-detail-parts';
import { useFixAction } from './audit-fix-target';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const VALID_TYPES: EntityType[] = ['builder_page', 'cms_page', 'product', 'collection'];

/* ── The surface ─────────────────────────────────────────────────────────── */

function AuditDetail({ ctx, type, id }: { ctx: SurfaceContext; type: EntityType; id: string }) {
  const { data: card, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAudit(type, id);
  const fixAction = useFixAction(ctx, type, id);

  const worthFixing = useMemo(
    () => (card?.checks ?? []).filter((c) => c.status === 'warn' || c.status === 'fail'),
    [card]
  );
  const alreadyGood = useMemo(
    () => (card?.checks ?? []).filter((c) => c.status === 'pass' || c.status === 'info'),
    [card]
  );

  // Which page this scores rides the tab. The opener passes the page's own
  // title; without one, the kind of page is the closest thing it has to a name,
  // and the qualifier keeps a tab reading "Product" from looking like a product.
  const paramTitle = typeof ctx.params.title === 'string' ? ctx.params.title : '';
  const pageName = card ? paramTitle || entityLabel(card.entityType) : null;
  useEffect(() => {
    if (pageName) ctx.setTitle(`${pageName} · page check`);
  }, [ctx, pageName]);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Page check actions"
        status={
          card ? (
            <Badge color={scoreTone(card.grade)} variant="soft" size="sm">
              {card.score} / 100 · {gradeLabel(card.grade)}
            </Badge>
          ) : null
        }
        /* Not a commit and not a lifecycle change — a jump. It goes in
           `primaryAction` because it is the ONE thing this pane offers, and as
           values so the bar may drop to the bare icon on a narrow pane. */
        primaryAction={fixAction}
        refresh={
          /* ALWAYS the last child — a fresh read here re-scores the page, so this
                      IS "check again". Carries ml-auto as the only right-hand control. */
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
          <div className={`${PANE_SHELL} p-2`}>
            <Card className="min-h-0 flex-1 items-center justify-center">
              <PaneLoadError
                title="Could not score this page"
                description="This is a problem reaching the server, or the page no longer exists. Nothing about the page itself has changed."
              />
            </Card>
          </div>
        ) : isPending || !card ? (
          <PaneWaiting label="Scoring this page…" />
        ) : (
          <div className={COLUMN}>
            <Text className="text-sm break-words">
              {entityLabel(card.entityType)}
              {ctx.params.path && typeof ctx.params.path === 'string'
                ? ` · ${ctx.params.path}`
                : ''}
            </Text>

            <ScoreCard card={card} />

            {/* The single highest-leverage fix, front and centre. When nothing is
                wrong the engine returns null, and we say so with a success note
                rather than a hollow prompt. */}
            {card.fixFirst ? (
              <Alert color="info">
                <Icon glyph={faLightbulb} className="size-5" aria-hidden />
                <AlertContent>
                  <AlertTitle>Fix this first</AlertTitle>
                  <AlertDescription>{card.fixFirst}</AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <Alert color="success" variant="soft">
                <Icon glyph={faCircleCheck} className="size-5" aria-hidden />
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
      <Card className="min-h-0 flex-1 items-center justify-center">
        <PaneLoadError
          reason="missing"
          title="No page to show"
          description="Open a page check from the Site checks list to see its breakdown here."
        />
      </Card>
    );
  }

  return <AuditDetail ctx={ctx} type={type as EntityType} id={id} />;
}
