'use client';

// A window's title bar — Piggles' own.
//
// ── WHY THIS IS NOT SPARX'S TAB ─────────────────────────────────────────────
//
// sparx fills its tab with the module's hue: `bg-module text-module-content`,
// a three-sided module-colored border, the label in on-fill ink. That is a
// deliberate and good answer for a dense tab strip — a row of saturated chips
// is scannable at a glance when eight of them share one strip.
//
// Piggles is not a tab strip. A group here is a WINDOW, usually holding one
// pane, and its bar is a title bar: the window's own surface, the app's icon in
// the app's color, the name in ordinary readable ink. The hue identifies WHICH
// APP this is, so it is carried by a SOFT tint and a saturated icon rather than
// a saturated fill — a wall of solid module color would fight the six-color
// rail already doing that job.
//
// The tint does fill its tab completely, top to bottom and edge to edge. That is
// not decoration creeping back in: a fill that stops short of the edges it is
// meant to describe reads as a rendering fault. Soft enough to sit under the
// text, complete enough to look intended.
//
// The BEHAVIOUR is deliberately the same, and most of it is imported rather than
// re-implemented: the dirty indicator, the pane-link helpers, the close guard
// and the surface registry are all platform. What is Piggles' here is what the
// bar looks like and which actions it offers.

import { useCallback, useEffect, useRef, useState } from 'react';
import { faStar, faXmark } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import type { IDockviewPanelHeaderProps } from 'dockview';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  PortalContainerProvider,
} from '@wizeworks/silicaui-react';
import { Tooltip } from '@wizeworks/silicaui-react';
import { ModuleScope } from '@/components/module-scope';
import { useFavorites, useToggleFavorite } from '@/lib/api/shell-data';
import { getSurface } from '@/lib/surfaces/registry';
import { useWorkbench } from '@/lib/workbench/context';
import { usePaneDirty } from '@/lib/workbench/dirty';
import { useOwnerWindowBody } from '@/lib/dock/window-boundary';
import { useCopyLink, usePaneLink } from '@/components/copy-pane-link';

/**
 * Favourite THIS pane's screen, from its own title bar.
 *
 * ── WHY IT IS HERE AND NOT IN THE APP TOOLBAR ───────────────────────────────
 *
 * It used to sit in the top toolbar and act on "whichever pane has focus". In a
 * workbench holding five panes at once that is a control with no visible
 * subject: you press a star at the top of the screen and something changes about
 * one of the windows below it, and which one depends on where you last clicked.
 * The tab has no such ambiguity — it IS the screen — so the control belongs on
 * it, beside the close button that already works the same way.
 *
 * A favourite is a SCREEN, never a record: "Invoices" can be one, invoice
 * INV-000004 cannot, because the rail would fill with rows nobody can maintain.
 * A pane opened with params is therefore offered nothing rather than a control
 * that would refuse — the tooltip on the close-neighbour explains why when it is
 * a near miss.
 */
function FavouriteButton({
  descriptor,
  title,
}: {
  descriptor: { surface: string; params?: Record<string, unknown> } | undefined;
  title: string;
}) {
  const { data: favorites } = useFavorites();
  const toggle = useToggleFavorite();

  const surfaceKey = descriptor?.surface ?? null;
  const hasParams = Boolean(descriptor?.params && Object.keys(descriptor.params).length > 0);
  // A record's pane cannot be favourited, and a disabled star on every entity
  // tab is chrome that never does anything — so it simply is not offered.
  if (!surfaceKey || hasParams) return null;

  const favourited = favorites?.some((favorite) => favorite.actionId === surfaceKey) ?? false;

  return (
    <Tooltip content={favourited ? 'Remove from favorites' : 'Add to favorites'}>
      <Button
        color="primary"
        variant="ghost"
        size="xs"
        shape="square"
        aria-label={favourited ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
        aria-pressed={favourited}
        disabled={toggle.isPending}
        className="shrink-0"
        onClick={(event) => {
          // The bar is also the pane's drag handle and its focus target.
          event.stopPropagation();
          toggle.mutate({ actionId: surfaceKey, favorited: favourited });
        }}
      >
        {/* FILLED when it is one, HOLLOW when it is not — the same solid glyph
            stroked instead of filled (see `outline` on @piggles/ui's Icon).
            State as shape, so it reads at a glance and still reads for anyone
            the color does not reach, on a tab that already has a soft module
            tint sitting behind it.

            `primary` rather than the `warning` this wore in the toolbar: amber
            is the status axis and means something is WRONG, which a favourite
            never is. Piggles Pink is the brand's one accent, and "I marked this"
            is exactly what an accent is for. */}
        <Icon
          glyph={faStar}
          outline={!favourited}
          className={favourited ? 'text-primary size-3.5' : 'size-3.5'}
          aria-hidden
        />
      </Button>
    </Tooltip>
  );
}

export function PaneTab(props: IDockviewPanelHeaderProps<{ paneId: string }>) {
  const { controller } = useWorkbench();
  const paneId = props.params.paneId;
  const descriptor = controller.getDescriptor(paneId);
  const definition = descriptor ? getSurface(descriptor.surface) : undefined;
  const glyph = definition?.icon;

  const dirty = usePaneDirty(paneId);
  const link = usePaneLink(paneId);
  const copyLink = useCopyLink();

  // Active state read from dockview rather than inferred from a CSS ancestor, so
  // the styling decision stays in React beside the hue.
  const [active, setActive] = useState(props.api.isActive);
  useEffect(() => {
    const sub = props.api.onDidActiveChange((event) => {
      setActive(event.isActive);
    });
    return () => {
      sub.dispose();
    };
  }, [props.api]);

  // Subscribed, not read once. A surface renames itself when its record loads
  // ("Invoice" ⇒ "INV-000004"), and reading `props.api.title` alone leaves the
  // placeholder showing until some unrelated re-render repaints it — which made
  // it look intermittent rather than broken.
  const [title, setTitle] = useState(props.api.title ?? 'Panel');
  useEffect(() => {
    setTitle(props.api.title ?? 'Panel');
    const sub = props.api.onDidTitleChange((event) => {
      setTitle(event.title || 'Panel');
    });
    return () => {
      sub.dispose();
    };
  }, [props.api]);

  // The menu must open in whichever window this bar currently lives in — the
  // header moves into the popout document along with its group.
  const hostRef = useRef<HTMLDivElement | null>(null);
  const menuContainer = useOwnerWindowBody(hostRef, props.api);

  // Closes a batch in order, STOPPING the moment somebody keeps one — a declined
  // "close anyway?" halts the sweep rather than closing past the thing they just
  // chose to save.
  const closeInOrder = useCallback(
    async (ids: string[]) => {
      for (const id of ids) {
        const closed = await controller.requestClose(id);
        if (!closed) break;
      }
    },
    [controller]
  );

  const panels = props.api.group.panels;
  const hasOthers = panels.length > 1;

  return (
    <ContextMenu>
      <ContextMenuTrigger ref={hostRef} className="flex h-full w-full min-w-0">
        <ModuleScope
          module={definition?.module ?? 'platform'}
          className={[
            'flex h-full w-full items-center gap-2 px-3',
            // Exactly ONE filled shape per strip, and it is the pane you are
            // looking at. The fill runs the bar's full height (globals.css zeroes
            // dockview's tab padding) because a tint that stops short of its own
            // edges reads as a rendering mistake, not a state.
            //
            // The others stay bare rather than taking a grey of their own: a
            // second fill turns a 44px bar into a patchwork, and two filled
            // blocks with no divider between them merge into one band. Bare +
            // filled is unambiguous at a glance and needs no divider at all.
            // Hover is what tells you a bare one is still a target.
            active ? 'bg-module bg-soft' : 'hover:bg-base-300 bg-transparent',
          ].join(' ')}
        >
          {/* The app's color lives HERE — one small saturated mark rather than
              a flooded bar. It is the same hue the rail uses for the same app,
              so the two read as one system. */}
          {glyph ? (
            <Icon glyph={glyph} className="text-module size-4 shrink-0" aria-hidden />
          ) : (
            <span className="bg-module size-2 shrink-0 rounded-full" aria-hidden />
          )}

          <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>
            {title}
          </span>

          {/* Unsaved work. A dot, not a word — it sits beside the name in a bar
              that may be 8rem wide, and it has to survive being truncated to
              nothing, which a label would not. */}
          {dirty ? (
            <span
              className="bg-warning size-2 shrink-0 rounded-full"
              aria-label="Unsaved changes"
              role="img"
            />
          ) : null}

          <FavouriteButton descriptor={descriptor} title={title} />

          {/* Always visible — not hover-revealed, and never `display: none`.
              Hiding it until hover is a desktop habit that costs more than it
              saves here: it makes closing a background pane a two-step (focus,
              then find the button that just appeared), it hides the control
              outright on touch, where there is no hover at all, and it makes the
              tab's width jump as the pointer crosses the strip. The tab is
              min-width 8rem, so the room is already reserved. */}
          <Button
            color="module"
            variant="ghost"
            size="xs"
            shape="square"
            aria-label={`Close ${title}`}
            data-tab-close
            className="shrink-0"
            onClick={(event) => {
              event.stopPropagation();
              void controller.requestClose(paneId);
            }}
          >
            <Icon glyph={faXmark} className="size-3.5" aria-hidden />
          </Button>
        </ModuleScope>
      </ContextMenuTrigger>

      {/* Portalled into the OWNING window so a right-click inside a torn-off
          window opens its menu there rather than in the main one. */}
      <PortalContainerProvider container={menuContainer}>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => {
              void controller.requestClose(paneId);
            }}
          >
            Close
          </ContextMenuItem>
          {hasOthers ? (
            <ContextMenuItem
              onClick={() => {
                const ids = panels.filter((p) => p.id !== paneId).map((p) => p.id);
                void closeInOrder(ids);
              }}
            >
              Close the others
            </ContextMenuItem>
          ) : null}
          {link ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => {
                  void copyLink(link);
                }}
              >
                Copy a link to this
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </PortalContainerProvider>
    </ContextMenu>
  );
}
