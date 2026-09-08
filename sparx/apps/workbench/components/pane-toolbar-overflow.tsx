'use client';

// Where a narrow toolbar's controls go.
//
// Not a Menu of menu-items: the things that live here are a search's siblings —
// selects, chip groups, toggle groups — and re-authoring each of them as a menu
// item would be a second way to write every toolbar. They are RELOCATED, not
// rewritten: the same nodes the wide toolbar renders inline, rendered here.
//
// ── RELOCATING IS NOT THE SAME AS REDESIGNING ──────────────────────────────
//
// The first version stacked everything in one column and it read as a pile of
// buttons with nothing to say what they were. Two reasons, both structural:
//
//   • A bar and a menu carry meaning differently. In a bar, POSITION does the
//     work — refresh is always right-most — and a tooltip covers the rest. A
//     menu has no position to read and no hover on a touch screen, so an
//     unlabelled glyph is a button with no meaning. Those two controls now take
//     `presentation="menu"` and wear their labels.
//   • Two different KINDS of thing were in one undifferentiated stack. What you
//     are looking at (filters, sorts) and what you can DO (refresh, copy a link)
//     answer different questions, so they are separated by a rule rather than
//     left to be told apart by guesswork.
//
// The trigger is `Menu`, and it is the SAME glyph the builders' overflow wears
// (@wizeworks/studio's builder-toolbar-overflow.tsx). "The rest of the controls" is
// one idea, so it is one thing to learn rather than two.
//
// It was `faSliders`, which this console spends in eleven other places to mean
// settings-and-adjustments — one glyph doing two jobs. Not an ellipsis either: the
// dock group's window menu wears one on the tab strip just above, and two identical
// glyphs a few pixels apart read as one control someone split in half.

import { cloneElement, isValidElement, useId, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { CopyPaneLink } from './copy-pane-link';
import { ToolbarFilterSelects, type ToolbarFilter } from './pane-toolbar-filters';
import { ToolbarActionRows, type ToolbarAction } from './pane-toolbar-actions';
import { ToolbarViewsControl, type ToolbarViews } from './pane-toolbar-views';
import type { ToolbarPresentation } from './toolbar-presentation';
import { Menu } from 'lucide-react';

interface PaneToolbarOverflowProps {
  /** The surface's own controls — what you are looking at. */
  controls?: React.ReactNode;
  /** Chrome — what you can do to this pane. Rendered as labelled rows. */
  actions?: React.ReactNode;
  /**
   * How many controls are currently narrowing what is on screen.
   *
   * This is the whole reason the collapse is safe. A list showing 3 of 40 rows
   * with the reason folded away inside a popover is a screen lying about itself,
   * and it lies hardest on the device where you can see least. A count on the
   * trigger keeps the fact visible even when the control is not.
   */
  activeCount?: number;
  /** Names what the popover controls, e.g. "Product list controls". */
  label: string;
}

export function PaneToolbarOverflow({
  controls,
  actions,
  activeCount = 0,
  label,
}: PaneToolbarOverflowProps) {
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [module, setModule] = useState<string | null>(null);

  // THE HUE DOES NOT SURVIVE THE PORTAL. `--color-module` is set by a
  // `data-module` attribute and CSS custom properties cascade by DOM, not by
  // React tree (see ModuleScope's header) — and a Popover's panel is portalled
  // to the document body, outside the pane that set it. So the same action was
  // this app's color in the bar and the brand's default pink one tap later,
  // which on a narrow screen is the ONLY version most people ever see.
  //
  // Read off the trigger, which IS inside the pane, at the moment of opening.
  // The attribute rather than a prop, because the popover is mounted by
  // PaneToolbar and the module belongs to whatever surface is above it.
  const carryHue = (open: boolean) => {
    if (!open) return;
    setModule(trigger.current?.closest('[data-module]')?.getAttribute('data-module') ?? null);
  };

  return (
    <Popover onOpenChange={carryHue}>
      <Tooltip
        // Right-most control on the bar, so a centred tooltip hangs off the pane
        // edge — same reasoning as RefreshButton.
        align="end"
        content={activeCount > 0 ? `${label} — ${String(activeCount)} in use` : label}
      >
        <PopoverTrigger>
          <Button
            ref={trigger}
            size="sm"
            shape="circle"
            className="relative shrink-0"
            aria-label={label}
            data-tour="pane-toolbar-overflow"
          >
            <Menu className="size-4" aria-hidden />
            {activeCount > 0 ? (
              // `module`, not a semantic tone: an active filter is not a warning
              // or a success, it is this app doing its job. The count is already
              // in the accessible name above, so this is decoration to a reader.
              <Badge color="module" size="xs" className="absolute -top-1 -right-1" aria-hidden>
                {activeCount}
              </Badge>
            ) : null}
          </Button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent
        {...(module ? { 'data-module': module } : {})}
        side="bottom"
        align="end"
        // `@container` so a control that still carries its own container query
        // resolves against THIS box rather than against the pane — without it a
        // query written for the wide bar reads the popover's ~20rem and the
        // control disappears from the one place it was moved to stay reachable.
        //
        // `p-0` because the zones below own their own padding: the action rows
        // are full-bleed so their hover band reaches the panel edge, the way a
        // menu row does, while the controls keep a comfortable gutter.
        //
        // `bg-base-100` is not belt-and-braces — the panel came up TRANSPARENT
        // with the table's rows reading straight through the controls, which is
        // most of why the first version looked like loose buttons rather than a
        // panel. A floating surface has to state its own ground.
        className="bg-base-100 @container w-[min(20rem,calc(100vw-2rem))] p-0 shadow-lg"
      >
        {/* A real heading, not `sr-only`. It is what turns a stack of controls
            into a panel that says what it is for — and it is free, because every
            toolbar already names itself for the ARIA landmark. */}
        <h2 id={titleId} className="px-4 pt-3 pb-1 text-sm font-semibold">
          {label}
        </h2>

        {controls ? (
          // Column, not a row: this is the one place these controls get to be
          // full-width, which is what a select or a chip group actually wants.
          // No blanket `w-full` — it would fight the `max-w-xs` wrappers many of
          // them carry — but `items-stretch` lets the ones that can, do.
          //
          // `[&>.btn]` reaches a button passed straight through `controls`, which
          // `items-stretch` widens and a silica `.btn` then centres — a stretched
          // row of centred text. DIRECT children only, so the buttons inside a
          // chip group or a select keep their own alignment.
          <div
            aria-labelledby={titleId}
            className="flex flex-col items-stretch gap-3 px-4 pt-2 pb-3 [&>.btn]:justify-start"
          >
            {controls}
          </div>
        ) : null}

        {controls && actions ? <div className="bg-base-300 h-px" aria-hidden /> : null}

        {actions ? (
          // A silica `.btn` centres its content, which is right in a bar and
          // wrong here. Every child of this zone is a relocated chrome row, so
          // the shape is stated once on the zone rather than trusted to each
          // control remembering MENU_ROW.
          <div className="flex flex-col p-1 [&_.btn]:w-full [&_.btn]:justify-start">{actions}</div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

interface CollapsedToolbarProps {
  label: string;
  activeCount: number;
  filters?: readonly ToolbarFilter[];
  actions?: readonly ToolbarAction[];
  controls?: React.ReactNode;
  refresh?: React.ReactNode;
  views?: ToolbarViews;
  /** Whether CopyPaneLink will render. Decided by the bar so the actions zone is
   *  never an empty strip of padding. */
  hasLink?: boolean;
}

/** Give a relocatable control its menu shape. Anything else passes through. */
function asMenuRow(node: React.ReactNode): React.ReactNode {
  return isValidElement<{ presentation?: ToolbarPresentation }>(node)
    ? cloneElement(node, { presentation: 'menu' })
    : node;
}

/**
 * What a narrow toolbar folds away, sorted into the two zones.
 *
 * Assembled here rather than in PaneToolbar so the bar states each slot once and
 * this file stays the single answer to "what does the popover contain".
 */
export function CollapsedToolbar({
  label,
  activeCount,
  filters,
  actions,
  controls,
  refresh,
  views,
  hasLink = true,
}: CollapsedToolbarProps) {
  const hasFilters = Boolean(filters && filters.length > 0);
  const hasActions = Boolean(actions && actions.length > 0);
  const hasRows = hasActions || Boolean(views) || Boolean(refresh) || hasLink;

  return (
    <PaneToolbarOverflow
      label={label}
      activeCount={activeCount}
      controls={
        hasFilters || controls ? (
          <>
            {hasFilters ? <ToolbarFilterSelects filters={filters ?? []} /> : null}
            {controls}
          </>
        ) : null
      }
      // Views sits with Refresh and Copy link, not with the surface's own
      // controls. Those narrow THIS list; these three are about the pane —
      // which question am I looking at, is it current, how do I send it.
      actions={
        hasRows ? (
          <>
            {hasActions ? <ToolbarActionRows actions={actions ?? []} /> : null}
            {views ? (
              <ToolbarViewsControl views={views} filters={filters ?? []} presentation="menu" />
            ) : null}
            {asMenuRow(refresh)}
            <CopyPaneLink presentation="menu" />
          </>
        ) : null
      }
    />
  );
}
