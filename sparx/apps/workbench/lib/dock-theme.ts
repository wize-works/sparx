import type { DockviewTheme } from 'dockview';

// The workbench dock: three options the layout ENGINE has to be told about.
//
// ── WHY THIS IS AN OBJECT AND NOT A STYLESHEET ──────────────────────────────
//
// Everything about how the dock LOOKS is in lib/dock/dock-theme.css, and that is
// the right place for it. These three are different in kind: dockview's layout
// engine reads them when it sizes and positions every group, and it derives the
// drop targets, sash hit-areas and drag previews from those rectangles.
//
// A gap painted in CSS afterwards moves the pixels and not the geometry. Even an
// attempt that LOOKED right would be a bug waiting to be reported: drop zones,
// splitter grabs and drag previews would all still be computed against the old,
// gapless rectangle. The library has to be told, not styled — and it has typed
// options for exactly this.
//
// ── WHAT THE CLASS NAME IS FOR ──────────────────────────────────────────────
//
// dockview puts `className` on its root, alongside its own `dv-dockview`. That
// gives this app a two-class scope for its `--dv-*` overrides, which beats the
// shared stylesheet regardless of injection order — `dock-theme.css` is imported
// from a COMPONENT, and Next injects component CSS after the global sheet, so at
// equal specificity the shared file would otherwise win.
export const WORKBENCH_DOCK_THEME: DockviewTheme = {
  name: 'sparx-workbench',
  className: 'sparx-dock',
  /** 10px between groups. Small enough to stay one workspace, large enough that
   *  two panes read as two objects rather than one with a line through it — and
   *  it is what makes a group read as a WINDOW once windows mode is on. */
  gap: 10,
  /** The drag overlay is mounted on the GROUP rather than the dock root, so the
   *  preview lands inside the window you are aiming at. With real gaps between
   *  groups an absolute overlay reads as floating in the gutter, pointing at
   *  nothing in particular. */
  dndOverlayMounting: 'relative',
  /** Dropping targets the whole group, title bar included — which is what a
   *  window-shaped group looks like it should accept. */
  dndPanelOverlay: 'group',
};
