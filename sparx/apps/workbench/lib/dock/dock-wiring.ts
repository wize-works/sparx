'use client';

// What mounting the dock actually involves: configure it, restore what was open,
// subscribe to it. Three calls in console-dock, three functions here — each one
// carrying the reasoning for a decision that has already been got wrong once.

import type { DockviewApi } from 'dockview';
import { loadLayout } from '@/lib/workbench/persistence';
import type { WorkbenchController } from '@/lib/workbench/controller';
import type { PaneDescriptor } from '@/lib/surfaces/descriptor';
import { DEFAULT_LAYOUT } from './default-layout';
import { WORKBENCH_DOCK_THEME } from '../dock-theme';

/**
 * The theme and the bounds, through the API rather than props.
 *
 * `<DockviewReact theme={…}>` TYPECHECKS — the props interface extends
 * DockviewOptions — and the React wrapper never reads it: its compiled source
 * contains no reference to `theme` at all. A prop that compiles, lints, and is
 * silently discarded.
 *
 * Called BEFORE any restore, so groups are built with both already in force.
 */
export function configureDock(api: DockviewApi): void {
  api.updateOptions({
    theme: WORKBENCH_DOCK_THEME,
    // A window stays in the workspace. dockview's default only guarantees a
    // sliver stays inside, so a window dragged left buries the app rail — this
    // product's navigation, which then cannot be used to get out from under it.
    floatingGroupBounds: 'boundedWithinViewport',
  });
}

/** The saved arrangement, or a fresh workspace when there is not one. */
export function restoreOrDefault(
  api: DockviewApi,
  controller: WorkbenchController,
  siteKey: string
): void {
  const stored = loadLayout(siteKey);
  if (!stored) {
    openDefaultLayout(controller);
    return;
  }

  // Descriptors FIRST — dockview mounts every pane synchronously while
  // deserializing, and each one resolves its descriptor on mount.
  controller.hydrate(stored.panes);
  try {
    api.fromJSON(stored.grid as Parameters<DockviewApi['fromJSON']>[0]);
    adoptPanesMissingFromGrid(api, controller, stored.panes);
  } catch (error) {
    // A layout saved by an older build can fail to deserialize. Falling back to
    // the default beats a blank screen nobody can escape.
    console.warn('[workbench] could not restore layout; starting fresh', error);
    openDefaultLayout(controller);
  }
}

function openDefaultLayout(controller: WorkbenchController): void {
  controller.hydrate({});
  DEFAULT_LAYOUT.forEach((entry) => controller.open(entry.surface, entry.params));
}

/**
 * Re-opens panes that exist in the saved SET but not in the saved GRID.
 *
 * The compact shell has no grid to write, so a pane opened on a phone has a
 * descriptor and no slot. Replaying only the grid would drop it silently.
 */
function adoptPanesMissingFromGrid(
  api: DockviewApi,
  controller: WorkbenchController,
  panes: Record<string, PaneDescriptor>
): void {
  for (const descriptor of Object.values(panes)) {
    if (api.getPanel(descriptor.id)) continue;
    controller.open(descriptor.surface, descriptor.params, { focus: false });
  }
}

export interface DockSubscriptionOptions {
  controller: WorkbenchController;
  persist: () => void;
  /** Runs one tick after a group is added, once dockview has settled it. */
  onGroupSettled: () => void;
}

/** dockview doesn't export IDisposable, so derive it from a subscription. */
type DockDisposable = ReturnType<DockviewApi['onDidLayoutChange']>;

/**
 * Let the HOVERED WINDOW take the drop that dockview's root would otherwise eat.
 *
 * ── THE BUG ─────────────────────────────────────────────────────────────────
 *
 * Dragging a tab onto another window did not add it to that window. It made a
 * NEW window beside it — the drag reading as failed, which is the exact outcome
 * `evictFromGrid` exists to prevent everywhere else.
 *
 * Windows mode floats every group, so dockview's primary grid is empty. Its ROOT
 * drop target reads an empty grid as "there is nothing here to land on" and
 * switches its own `center` zone on for the WHOLE dock (`canDisplayOverlay` in
 * dockviewComponent: `return this.gridview.length === 0`). Its four edge zones
 * are 10px; everything inside them is center. So the root claims the entire
 * workspace, windows included.
 *
 * That would still be harmless if the windows were asked first — but dockview
 * registers every `dragover` listener in the CAPTURE phase, so the OUTERMOST
 * target runs first. The root stamps the event as handled (`markAsUsed`) and
 * every window under the pointer then bails out on `isAlreadyUsed`: no overlay
 * while dragging, and on release the root's own drop runs instead, which creates
 * a fresh grid group that `evictFromGrid` dutifully floats.
 *
 * None of it is visible in tabs mode, because the grid is not empty there: the
 * root declines `center`, and groups have always been asked normally.
 *
 * ── THE FIX ─────────────────────────────────────────────────────────────────
 *
 * Decline the root's center overlay while the pointer is over a floating window.
 * The check runs BEFORE `markAsUsed`, so declining leaves the event unclaimed
 * and the window's own drop targets — body, title bar and tab strip alike — pick
 * it up on the way down. That is the ordinary dockview path, restored rather
 * than replaced: a tab joins the window it was dropped on, and a whole window
 * dragged onto another merges into it.
 *
 * NOT gated on windows mode, deliberately. The condition is "the pointer is over
 * a window", and a window should own its own drops in either presentation. Empty
 * ground is untouched, so dropping a tab into the gutter still makes a window.
 */
function claimDropsForHoveredWindows(api: DockviewApi): DockDisposable {
  return api.onWillShowOverlay((event) => {
    // 'edge' is the root's overlay. A window's own are 'content' / 'tab' /
    // 'header_space', and those are precisely what this hands the drop back to.
    if (event.kind !== 'edge' || event.position !== 'center') return;
    if (!isOverFloatingGroup(api, event.nativeEvent)) return;
    event.preventDefault();
  });
}

/**
 * Hit-tested against each window's own box rather than read off `event.target`.
 *
 * A pane renders arbitrary content — including surfaces that portal out of the
 * group's subtree — so the element under the cursor is not reliably a descendant
 * of the window it visually sits inside. The rectangle always is.
 */
function isOverFloatingGroup(api: DockviewApi, event: DragEvent): boolean {
  return api.groups.some((group) => {
    if (group.api.location.type !== 'floating') return false;
    const box = group.element.getBoundingClientRect();
    return (
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    );
  });
}

export function subscribeDock(
  api: DockviewApi,
  { controller, persist, onGroupSettled }: DockSubscriptionOptions
): DockDisposable[] {
  return [
    claimDropsForHoveredWindows(api),
    // A pane closed by the tab's × bypasses controller.close(), so reconcile
    // here rather than leaking descriptors and guards for dead panes.
    api.onDidRemovePanel((panel) => {
      controller.forget(panel.id);
      persist();
    }),
    api.onDidLayoutChange(persist),
    api.onDidActivePanelChange((panel) => {
      controller.setActivePane(panel?.id ?? null);
    }),
    // Tearing a pane off (or dismissing a popout) adds/removes a GROUP, not a
    // panel — so the status bar's detached-windows chip needs these two.
    api.onDidAddGroup(() => {
      controller.hostChanged();
      // dockview fires this while still CREATING the group, so its location can
      // read 'grid' at this instant. One deferred pass settles on the real one.
      setTimeout(() => {
        controller.hostChanged();
        onGroupSettled();
      }, 0);
    }),
    api.onDidRemoveGroup(() => {
      controller.hostChanged();
    }),
  ];
}
