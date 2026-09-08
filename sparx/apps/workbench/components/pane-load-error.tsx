'use client';

// What a surface shows when it could not load its content — and the one place
// the rule that governs it lives.
//
// The sibling of <ListEmptyState>. That file decides what an empty LIST says;
// this one decides what a surface says when there is nothing to show because the
// server could not be reached. Between them, a surface never has to invent a
// state.
//
// ── THE THREE STATES ────────────────────────────────────────────────────────
//
// A pane's content is in exactly one of three states, and each has exactly one
// shape:
//
//   waiting        → <PaneWaiting>
//   nothing there  → <ListEmptyState> (a list) or <PaneEmpty> (anything else)
//   could not load → this
//
// Only the first two had a home, so the third got rebuilt at the call site and
// drifted into three different shapes — an <Alert> centred in a bare div, a bare
// <EmptyState> centred in a bare div, and an <EmptyState> inside the surface's
// own card. Same failure, three appearances, in panes a person sees side by side
// in one dock.
//
// ── ALERT IS A BANNER. IT IS NEVER A REPLACEMENT. ───────────────────────────
//
// This is the distinction that was being lost, and it is what made the worst of
// those variants look broken:
//
//   <Alert> is for when the content IS on screen and something needs saying —
//   a background refetch failed, a save failed, a value needs attention. It sits
//   ABOVE or BESIDE content that is still there.
//
//   An empty-state shape is for when the content is ABSENT. A first load that
//   failed means there is nothing behind the message, so an alert is describing
//   a thing the person cannot see. It reads as a stray error box floating in a
//   void, because that is what it is.
//
// A failed FIRST load is the absent case. A failed refetch, with the last good
// data still on screen, is the banner case — and must never tear the content
// down, which over an editor would discard unsaved work on a blip.
//
// ── THE FRAME IS PART OF THE ANSWER, AND IT IS NOT THIS COMPONENT'S ─────────
//
// This renders the message and nothing around it. It goes INSIDE the surface's
// own content card — the same card the rows would have filled — as a sibling of
// the loading and empty branches. One card, four possible contents.
//
// It deliberately does NOT bring a card of its own. The card is the surface's
// content REGION, and a state that carries its own ends up either replacing that
// region (so the toolbar's relationship to it changes depending on which state
// you are in) or nested two cards deep.
//
// So the real bug in the surfaces this replaces was never the message — it was
// an early `return` that skipped the region altogether:
//
//   if (isError) return <div className="flex h-full items-center justify-center">…
//
// That drops the toolbar AND the card, leaving the message floating in an empty
// pane. Never do this. Render the normal shell, and branch INSIDE the card.
//
// The toolbar stays, and stays ENABLED. The failure is about the data, not the
// surface: "New product" still works when the product LIST could not load, and
// changing a filter re-runs the query, which is a second way out that disabling
// the controls would take away. An early return says "this entire screen is
// broken" — a bigger claim than the truth.

import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, EmptyState } from '@wizeworks/silicaui-react';
import { paneLoadReason } from '../lib/api-error';

/** What a record pane says when the record is not this business's to see. It
 *  never confirms that the thing exists somewhere else. */
const GONE =
  'It has been deleted, or the address points at something that is not in this business. Nothing of yours has been lost.';

export function PaneLoadError({
  icon,
  title,
  description,
  error,
  noun,
  missingTitle,
  missingDescription,
  reason,
  onRetry,
  retryLabel = 'Try again',
  actions,
}: {
  /** The surface's own glyph, reused — so a pane that failed still looks like
   *  the pane it is. Defaults to a warning triangle, which is the honest answer
   *  when a surface has no glyph to lend: an empty chip, or none at all, leaves
   *  the state with no anchor and makes it read as a stray paragraph. */
  icon?: ReactNode;
  /** What could not be loaded, in the operator's terms: "Could not load your
   *  products", never "Request failed" or a status code. ReactNode rather than
   *  string because a detail pane names the record it could not reach. */
  title: ReactNode;
  /** What it means and what it does NOT mean. The most valuable sentence here
   *  is usually the reassurance — a load failure looks identical to data loss
   *  from the outside, and only this message can tell them which it was. */
  description?: ReactNode;
  /**
   * WHY there is nothing to show — two different facts that were being told in
   * the same voice.
   *
   *   'unreachable' — the server could not be reached. The data still exists;
   *                   this is a blip. Retrying is exactly the right move.
   *   'missing'     — the record is gone (a 404). Retrying cannot help, and
   *                   offering it invites someone to press a button that will
   *                   fail every time; the way out is back to the list.
   *
   * The tone follows: error for a failure, warning for something that simply is
   * not there any more. A deleted record is not a fault, and painting it red
   * tells somebody their data broke when it was probably them who deleted it.
   *
   * `onRetry` is IGNORED when the reason is 'missing' — the component owns that
   * rule, so a caller cannot accidentally offer a retry that cannot work.
   *
   * Pass `error` instead and this is worked out; pass this to overrule it.
   */
  reason?: 'unreachable' | 'missing';
  /**
   * The query's error, so the reason above is READ rather than assumed.
   *
   * It used to default to 'unreachable', which is a claim: a 404 arrived in
   * milliseconds and the pane said the server could not be reached, over a
   * retry that could only ever fail. Every pane that loads one record by id
   * should pass this — a deleted record, a saved layout pinned to one, and a
   * link to another business all arrive as a 404.
   */
  error?: unknown;
  /** The thing, in the operator's words — "product", "order". Only used to word
   *  the not-there state, which is why it is separate from `title`. */
  noun?: string;
  /** Overrides for the not-there wording, where the generic is too vague. A
   *  caller that sets `reason` explicitly is already saying which state it is
   *  in, so its own `title`/`description` are used and these are not needed. */
  missingTitle?: ReactNode;
  missingDescription?: ReactNode;
  /** Re-runs the query. Omitted only where nothing can be retried from here. */
  onRetry?: () => void;
  /** Overridden only when "Try again" would be the wrong verb. */
  retryLabel?: string;
  /** Extra recovery beyond retrying — a way to reach the thing another way.
   *  Rendered after the retry button, so retry stays the obvious move. */
  actions?: ReactNode;
}) {
  const missing = (reason ?? paneLoadReason(error)) === 'missing';
  // Suppressed HERE rather than trusted to every call site: a retry against a
  // record that no longer exists fails every single time, and a button that
  // cannot work is worse than no button.
  const retry = missing ? undefined : onRetry;
  // The caller's `description` is written about the OTHER case — it says the
  // server could not be reached — so it must not survive into this one. A
  // caller with no `noun` and no override has said nothing about being missing,
  // and keeping its own words is the only honest option left.
  const shownTitle = missing
    ? (missingTitle ?? (noun ? `That ${noun} is no longer here` : title))
    : title;
  const shownDescription = missing
    ? (missingDescription ?? (noun ? GONE : description))
    : description;

  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center gap-1 px-6 py-10">
      <EmptyState
        // ── THE GLYPH IS RED, AND THAT IS THE WHOLE POINT ──────────────────────
        //
        // silica's EmptyState is colorless by design and its icon chip paints a
        // 55%-faded base-content glyph on base-200. So a list that FAILED and a
        // list that is EMPTY drew the identical grey picture, and the only thing
        // telling them apart was a sentence you had to stop and read. Two
        // different facts cannot share one appearance (DESIGN.md RULE #4) — and a
        // faded glyph is not readable ink either (RULE #3).
        //
        // The tone is decided HERE rather than at the call site precisely because
        // there are a hundred call sites: the caller passes its own glyph, this
        // decides what a failure looks like, and changing that decision is one
        // edit. Wrapping works because the glyph fills `currentColor` — there is
        // no prop that reaches the chip, and re-skinning silica's chip from out
        // here would be the RULE #1 violation this is avoiding.
        icon={
          <span className={missing ? 'text-warning' : 'text-error'}>
            {icon ?? <AlertTriangle className="size-6" aria-hidden />}
          </span>
        }
        title={shownTitle}
        description={shownDescription}
        actions={
          retry || actions ? (
            <>
              {retry ? (
                // `module`, not `error`. The glyph already said it failed; this
                // button's job is to try again, and coloring recovery as danger
                // tells somebody the safe move is the risky one.
                <Button size="sm" color="module" onClick={retry}>
                  {retryLabel}
                </Button>
              ) : null}
              {actions}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
