'use client';

// The workbench dock — dockview wired to the workbench controller, in either of
// the two presentations.
//
// dockview owns LAYOUT (the grid, tab strips, splitters, drag, popout windows).
// The controller owns MEANING (which surface a pane shows). Keeping that split
// clean is why the persisted payload has two halves: dockview's opaque `grid`
// blob and our `panes` map. Neither side needs to understand the other.
//
// ── WHY THIS REPLACED THE PLAIN DOCK ────────────────────────────────────────
//
// The old lib/dock/dock.tsx did the same wiring for the tiled grid alone. This
// file does it for BOTH presentations, because switching between them is not a
// CSS change: windows mode has no grid at all, so every group has to be lifted
// onto a free canvas and put back again, and that needs the api, the controller
// and the site key at once. All three are already here — handing the api
// outward meant the shell reached back in.
//
// Each decision carries its reasoning in the file that owns it rather than here:
//
//   PaneTab · GroupActions      what a group's title bar looks like and offers
//   dock-theme.ts               the gap, and why it cannot be CSS
//   dock-wiring.ts              the theme prop dockview silently discards
//   window-mode.ts              windows vs tabs, and why windows has no grid
//   use-window-canvas.ts        the desk, and why only the clip layer resizes
//   window-zoom.ts              zoom, and why it is not a transform

import { useCallback, useEffect, useRef, useState } from 'react';
import { DockviewReact, type DockviewApi, type DockviewReadyEvent } from 'dockview';
import { useWorkbench } from '@/lib/workbench/context';
// Platform plumbing — the controller bridge and the pane renderer.
import { DockPaneHost } from '@/lib/dock/dock-host';
import { Pane } from '@/lib/dock/pane';
// Chrome — the title bar, its buttons, and what a fresh workspace opens with.
import { GroupActions } from './group-actions';
import { PaneTab } from './pane-tab';
import { configureDock, restoreOrDefault, subscribeDock } from './dock-wiring';
import { usePersistLayout } from './use-persist-layout';
import { useCanvasCommands } from './use-canvas-commands';
import { useCanvasScroll } from './use-canvas-scroll';
import { CanvasTools } from '@/components/canvas-tools';
import { EmptyWorkspace } from '@/components/empty-workspace';
import { stepZoom, type ZoomLevel } from '../window-zoom';
import type { FloatBox } from '../window-placement';
import { useDropAnchor } from './use-drop-anchor';
import { WindowCanvas, useWindowCanvas } from './window-canvas';
import { useUnloadGuard } from './use-unload-guard';
import { applyWindowMode, evictFromGrid, switchWindowMode, type WindowMode } from '../window-mode';
import { WindowModeProvider } from '../window-mode-context';
// dockview's reset, then this app's own skin over it — `dock-theme.css` maps
// every `--dv-*` onto the surface ramp, and it is scoped to `.sparx-dock` so it
// beats the reset regardless of which order Next injects them in.
import 'dockview/dist/styles/dockview.css';
import './dock-theme.css';

const components = { surface: Pane };
const tabComponents = { surface: PaneTab };

export function ConsoleDock({
  siteKey,
  mode,
  zoom,
  onChangeZoom,
}: {
  siteKey: string;
  /**
   * Windows or tabs — NULL until the shell has read the stored preference.
   *
   * The null state is load-bearing, not defensive. Defaulting to 'tabs' for the
   * one render before localStorage is read meant a returning windows user had
   * their restored floating layout tiled and then re-floated — and the tiled
   * intermediate got saved over their real tabs arrangement on the way past.
   * A presentation nobody has chosen yet is not 'tabs'; it is unknown.
   */
  mode: WindowMode | null;
  /** How much of the workspace fits on screen — see lib/window-zoom.ts. The
   *  shell owns the preference; the control that changes it is on the canvas. */
  zoom: ZoomLevel;
  onChangeZoom: (zoom: ZoomLevel) => void;
}) {
  const { controller } = useWorkbench();
  const apiRef = useRef<DockviewApi | null>(null);
  /** The presentation currently ON SCREEN, which is not the same as the prop
   *  until both the dock and the stored preference have arrived. */
  const appliedMode = useRef<WindowMode | null>(null);
  // Read inside onReady, which dockview calls exactly once — a dependency would
  // rebuild the callback for a value it only ever samples.
  const modeRef = useRef<WindowMode | null>(mode);
  modeRef.current = mode;
  const disposables = useRef<ReturnType<typeof subscribeDock>>([]);
  /** Each window's box at 100%, so zooming out and back is exact. Dropped the
   *  moment somebody moves a window themselves — see rescaleWindows. */
  const zoomBases = useRef(new Map<string, FloatBox>());
  const forgetZoomBases = useCallback(() => {
    zoomBases.current.clear();
  }, []);
  // What happens when a drag finishes needs the canvas, and the canvas needs to
  // be told what happens when a drag finishes. The ref breaks that circle and
  // always holds the current one.
  const dragEnded = useRef<(moved: HTMLElement | null) => void>(() => undefined);
  const canvas = useWindowCanvas({
    zoom,
    onDragEnd: (moved) => dragEnded.current(moved),
    onZoomStep: (direction) => {
      onChangeZoom(stepZoom(zoom, direction));
    },
  });
  const { frameRef, canvasRef, readViewport, fit } = canvas;
  const { takeDropPoint } = useDropAnchor(canvasRef);
  useCanvasScroll(frameRef, siteKey, mode);
  const commands = useCanvasCommands({
    api: apiRef,
    canvas: canvasRef,
    readViewport,
    zoom,
    fit,
    bases: zoomBases,
    forget: forgetZoomBases,
  });
  dragEnded.current = commands.dragEnded;

  const write = usePersistLayout({ api: apiRef, controller, siteKey, appliedMode, fit });
  /** Nothing open at all — a state the canvas has to answer for, since an empty
   *  desk with no explanation reads as a console that failed to load. */
  const [bare, setBare] = useState(false);
  const persist = useCallback(() => {
    write();
    setBare((apiRef.current?.panels.length ?? 0) === 0);
  }, [write]);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const api = event.api;
      apiRef.current = api;
      controller.attach(new DockPaneHost(api));
      configureDock(api);
      restoreOrDefault(api, controller, siteKey);

      // Parked on a ref rather than returned: onReady is a callback, not an
      // effect, so dockview never calls anything we return.
      disposables.current = subscribeDock(api, {
        controller,
        persist,
        // A group settling into the grid while windows are on screen is the
        // drag-out case — put it where it was dropped.
        onGroupSettled: () => {
          if (modeRef.current !== 'windows') return;
          evictFromGrid(api, takeDropPoint(), readViewport());
        },
      });

      controller.setActivePane(api.activePanel?.id ?? null);

      // If the preference is already known, dress the restored arrangement in
      // it now. If it is not, the effect below does it the moment it arrives —
      // and doing nothing here is what keeps a half-known mode from being
      // applied and then saved.
      const known = modeRef.current;
      if (known) {
        applyWindowMode(api, known, readViewport());
        appliedMode.current = known;
      }
    },
    [controller, persist, readViewport, siteKey, takeDropPoint]
  );

  // The presentation, applied and re-applied.
  //
  // First arrival (null ⇒ X) only DRESSES what the layout already restored:
  // that layout was saved in mode X, so it is already arranged correctly and
  // there is no other arrangement to fetch. Switching (X ⇒ Y) is the real move
  // and goes through switchWindowMode, which photographs X on the way out and
  // restores Y's own arrangement.
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !mode || appliedMode.current === mode) return;
    const previous = appliedMode.current;
    appliedMode.current = mode;
    if (!previous) {
      applyWindowMode(api, mode, readViewport());
      return;
    }
    switchWindowMode(api, controller, siteKey, previous, mode, readViewport());
    fit();
  }, [mode, controller, fit, readViewport, siteKey]);

  useEffect(() => {
    const subs = disposables;
    return () => {
      for (const sub of subs.current) sub.dispose();
      subs.current = [];
      controller.detach();
    };
  }, [controller]);

  useUnloadGuard(controller);

  return (
    // Three layers — scrolling frame, scroll extent, and the desk dockview
    // positions windows on. See window-canvas.
    <WindowCanvas
      handle={canvas}
      mode={mode}
      zoom={zoom}
      empty={bare ? <EmptyWorkspace /> : null}
      tools={
        <CanvasTools
          mode={mode}
          zoom={zoom}
          onChangeZoom={onChangeZoom}
          onArrange={commands.arrange}
        />
      }
    >
      {/* Inside, so the title bars dockview mounts can read the presentation
          they are being asked to offer actions for. */}
      <WindowModeProvider mode={mode}>
        <DockviewReact
          className="h-full"
          components={components}
          tabComponents={tabComponents}
          rightHeaderActionsComponent={GroupActions}
          onReady={onReady}
          // Tearing a tab out detaches it into its own OS window; dockview loads
          // /popout there and portals the group across.
          popoutUrl="/popout"
          // Floating groups are what "windows mode" is built on — see
          // lib/window-mode.ts. They are also why a gap matters: dockview floats a
          // group when a tab is dragged into empty space, and a flush grid has none.
          disableFloatingGroups={false}
          // dockview's own overflow dropdown cannot be made good from out here: it
          // re-renders the TAB component per row and sizes the popup a frame before
          // React fills it, so a long list renders past both ends of the screen with
          // nothing to scroll. The replacement is the arrows in the group header.
          disableTabsOverflowList
        />
      </WindowModeProvider>
    </WindowCanvas>
  );
}
