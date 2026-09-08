'use client';

// The right end of every group's tab strip: what's open here, and what you can
// do to the group as a whole.
//
// ── FOUR CONTROLS, IN THE ORDER YOU REACH FOR THEM ──────────────────────────
//
// The tab list answers "where is the thing I opened" once the strip has more
// tabs than it can show — see ./tab-list-menu.tsx, which replaces dockview's own
// unusable overflow dropdown.
//
// Then a menu for the rarer moves, then maximize, then close. The two frequent
// ones stay as buttons because a control you use constantly should not cost a
// tap to reveal; the rest live behind the menu so the strip stays a tab strip.
//
// ── WHY TEAR-OFF IS A BUTTON RATHER THAN A GESTURE ──────────────────────────
//
// A browser cannot detect a tab dragged outside its own window, so "move this to
// its own window" has to be an explicit control. dockview's `popoutUrl` only
// says where a detached group loads, not how one gets detached. Closing a popout
// window also returns its group — the menu item is the discoverable path, not
// the only one.
//
// ── WHAT IS DELIBERATELY ABSENT ─────────────────────────────────────────────
//
// "Let this float freely" is not here, and that is not an oversight. Floating
// needs somewhere to float ONTO, and this workbench is a tiled dock: a fully
// tiled grid has no empty space, so a floated group would have nowhere to land.
// The other console offers it because it presents panes as loose windows on a
// free canvas; this one tiles, on purpose, for somebody at a desk who wants
// everything visible at once. See the parity check's `lib/window-mode` entry.
//
// Maximize is the answer this presentation gives to the same want — "let me see
// this one properly" — and it works without a canvas.

import { useEffect, useState } from 'react';
import type { IDockviewHeaderActionsProps } from 'dockview';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { AppWindow, Ellipsis, Maximize2, Minimize2, PanelsTopLeft, X } from 'lucide-react';
import { ChromeWindowBoundary } from './window-boundary';
import { TabListMenu } from './tab-list-menu';
import { useWorkbench } from '../workbench/context';

export function GroupActions(props: IDockviewHeaderActionsProps) {
  const { controller } = useWorkbench();

  // Location is live state, not a render-time constant: the SAME group instance
  // survives the move, so the buttons must re-render from grid → popout.
  const [location, setLocation] = useState(props.api.location.type);
  useEffect(() => {
    const sub = props.api.onDidLocationChange((event) => {
      setLocation(event.location.type);
    });
    return () => {
      sub.dispose();
    };
  }, [props.api]);

  const [maximized, setMaximized] = useState(props.api.isMaximized());
  useEffect(() => {
    // dockview has no per-group "did maximize change" event, so this re-reads on
    // any layout change — which is what maximizing is.
    const sub = props.containerApi.onDidLayoutChange(() => {
      setMaximized(props.api.isMaximized());
    });
    return () => {
      sub.dispose();
    };
  }, [props.api, props.containerApi]);

  const detached = location === 'popout';

  /**
   * Closes every pane in the group, one at a time, stopping at the first refusal.
   *
   * Through the CONTROLLER, never `group.api.close()` — the guard conversation
   * for unsaved work lives there, and closing a whole group is the most
   * expensive way to lose something. Stopping at the first refusal is the point:
   * somebody who says "no, don't discard that" has answered about the group, not
   * just about one tab.
   */
  const closeAll = () => {
    const ids = props.panels.map((panel) => panel.id);
    void (async () => {
      for (const id of ids) {
        const closed = await controller.requestClose(id);
        if (!closed) break;
      }
    })();
  };

  return (
    // The boundary keeps these buttons' tooltips and menus in the group's own
    // window once it is torn off — same fix the panes get, chrome-sized.
    <ChromeWindowBoundary api={props.api}>
      <TabListMenu panels={props.panels} activePanel={props.activePanel} />

      {/* Neither `color` nor `variant` beyond ghost on any of these: a bare
          `.btn` resolves to `base-content`, which is the theme-correct ink for
          chrome that belongs to no module and carries no state. */}
      <DropdownMenu>
        <Tooltip content="More">
          <DropdownMenuTrigger>
            <Button variant="ghost" size="xs" shape="square" aria-label="More">
              <Ellipsis className="size-3.5" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              if (detached) {
                // No target group + a position = dock back into the grid's edge.
                props.api.moveTo({ position: 'right' });
              } else {
                void props.containerApi.addPopoutGroup(props.group);
              }
            }}
          >
            {detached ? (
              <PanelsTopLeft className="size-4" aria-hidden />
            ) : (
              <AppWindow className="size-4" aria-hidden />
            )}
            {detached ? 'Bring these tabs back' : 'Move these tabs to their own window'}
          </DropdownMenuItem>

          <DropdownMenuItem onClick={closeAll}>
            <X className="size-4" aria-hidden />
            Close everything in here
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden for a popout: it already owns its screen, so "fill the
          workspace" would be describing something that has already happened. */}
      {detached ? null : (
        <Tooltip content={maximized ? 'Put it back' : 'Make this fill the workspace'}>
          <Button
            variant="ghost"
            size="xs"
            shape="square"
            aria-label={maximized ? 'Restore this group' : 'Make this group fill the workspace'}
            aria-pressed={maximized}
            onClick={() => {
              if (maximized) props.api.exitMaximized();
              else props.api.maximize();
              setMaximized(!maximized);
            }}
          >
            {maximized ? (
              <Minimize2 className="size-3.5" aria-hidden />
            ) : (
              <Maximize2 className="size-3.5" aria-hidden />
            )}
          </Button>
        </Tooltip>
      )}

      <Tooltip content="Close">
        <Button
          variant="ghost"
          size="xs"
          shape="square"
          aria-label="Close everything in this group"
          onClick={closeAll}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      </Tooltip>
    </ChromeWindowBoundary>
  );
}
