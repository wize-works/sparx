'use client';

// Re-read this list from the server, now.
//
// Why this exists at all, given the query client already sets `staleTime: 60s`
// and `refetchOnWindowFocus: true`: those defaults assume a PAGE you navigate
// away from and come back to. In a dock you do neither. You sit in one window
// all day, and a pane parked in a background tab group can be hours stale while
// window focus never changes once. So the case this covers is not "I came back
// to my desk" — that is already handled — it is "someone else changed something,
// or a job finished, and I want to see it without hunting for a way to reload".
//
// One shared control rather than a button per list, because fifteen surfaces
// hand-rolling their own is fifteen slightly different spinners, hit targets and
// tooltips.
//
// PLACEMENT IS PART OF THE CONTRACT: this is ALWAYS the last child of a list
// toolbar — the right-most control, past even the primary action. The primary
// action is large, colored and labelled, so people find it by how it LOOKS; a
// small grey icon can only be found by where it SITS. Pinning the icon and
// letting the primary action settle at second-from-right keeps both predictable,
// and means nobody ever scans a toolbar hunting for refresh.

import { Button, Timestamp, Tooltip } from '@wizeworks/silicaui-react';
import { RefreshCw } from 'lucide-react';
import { MENU_ROW, type ToolbarPresentation } from './toolbar-presentation';

interface RefreshButtonProps {
  /** `isFetching` from the query — true for a background refetch too, which is
   *  exactly when the button should read as busy. */
  isFetching: boolean;
  /** `dataUpdatedAt` from the query. Omit only if the list genuinely has no
   *  loaded data yet. */
  updatedAt?: number;
  onRefresh: () => void;
  /** Layout only. Needed on lists with NO primary action: the primary button
   *  normally carries the `ml-auto` that pushes the right-hand group over, so
   *  without one this has to carry it itself or it sits against the filters. */
  className?: string;
  /**
   * `bar` (default) is the icon in the toolbar. `menu` is the same action inside
   * PaneToolbar's overflow popover.
   *
   * These cannot be the same control. In a bar an icon works because POSITION
   * carries it — always right-most, always the same place — with a tooltip for
   * anyone who needs the word. In a menu there is no position to read and no
   * hover on a touch screen, so a bare glyph is a button with no meaning. It
   * gets its label, and the freshness that hid in the tooltip becomes visible,
   * because a menu row has somewhere to put it.
   */
  presentation?: ToolbarPresentation;
}

export function RefreshButton({
  isFetching,
  updatedAt,
  onRefresh,
  className,
  presentation = 'bar',
}: RefreshButtonProps) {
  if (presentation === 'menu') {
    return (
      // No `color`: this is chrome, and a bare `.btn` resolves to `base-content`,
      // which is the theme-correct answer for an untyped action.
      <Button
        size="sm"
        variant="ghost"
        className={MENU_ROW}
        loading={isFetching}
        onClick={onRefresh}
      >
        <RefreshCw className="size-4" aria-hidden />
        <span>Refresh this list</span>
        {updatedAt ? (
          <span className="ml-auto text-sm [&_time]:text-inherit">
            <Timestamp value={updatedAt} format="relative" />
          </span>
        ) : null}
      </Button>
    );
  }

  return (
    <Tooltip
      // This button is always the right-most control, so a centred tooltip would
      // hang off the window edge and rely on collision-shifting to rescue it.
      // Ending it at the trigger keeps it inboard by construction.
      align="end"
      content={
        // Freshness lives in the tooltip rather than as visible text: a toolbar
        // already carries search, a count and a primary action, and "Updated 3
        // minutes ago" sitting there permanently is clutter on every list in the
        // app. It is the answer to "do I even need to click this?", which is a
        // question you ask about once a session.
        updatedAt ? (
          // `[&_time]:text-inherit` is load-bearing. A tooltip is a DARK surface,
          // and Timestamp renders a <time> carrying its own body ink — which on
          // that background came out near-black and unreadable, while the plain
          // text beside it was fine. Forcing the descendant to inherit the
          // tooltip's ink fixes it without abandoning the shared component (and
          // hand-rolling relative-time math is exactly what Timestamp exists to
          // prevent). Targeting the descendant, rather than passing a class to
          // Timestamp, is what wins on specificity.
          <span className="[&_time]:text-inherit">
            Refresh · updated <Timestamp value={updatedAt} format="relative" />
          </span>
        ) : (
          'Refresh'
        )
      }
    >
      <Button
        size="sm"
        variant="ghost"
        shape="square"
        className={className}
        aria-label="Refresh this list"
        // `loading` swaps in silica's spinner AND makes the button
        // non-interactive, so a second click cannot queue a second fetch.
        loading={isFetching}
        onClick={onRefresh}
      >
        <RefreshCw className="size-4" aria-hidden />
      </Button>
    </Tooltip>
  );
}
