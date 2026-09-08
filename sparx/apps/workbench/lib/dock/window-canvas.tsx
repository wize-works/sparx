'use client';

// The three layers the workspace is made of. What each one is FOR, and why the
// middle one is the only one that ever resizes, is in use-window-canvas.

import type { ReactNode } from 'react';
import type { WindowMode } from '../window-mode';
import { zoomPercent, type ZoomLevel } from '../window-zoom';
import type { WindowCanvasHandle } from './use-window-canvas';

export { useWindowCanvas, type WindowCanvasHandle } from './use-window-canvas';

export function WindowCanvas({
  handle,
  mode,
  zoom,
  tools,
  empty,
  children,
}: {
  handle: WindowCanvasHandle;
  mode: WindowMode | null;
  zoom: ZoomLevel;
  /** Pinned to the bottom-right of the frame, above every window. */
  tools?: ReactNode;
  /** Shown over the frame when there is nothing open at all. */
  empty?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative h-full">
      <div ref={handle.frameRef} className="h-full overflow-auto">
        <div ref={handle.clipRef} className="relative h-full w-full overflow-clip">
          <div
            ref={handle.canvasRef}
            // What the pane-contents half of the zoom is keyed on — the rules
            // live in app/globals.css, since the steps are a closed set.
            data-zoom={zoomPercent(zoom)}
            className={
              mode === 'windows'
                ? // A constant, and deliberately larger than any display: the
                  // desk a window can be pushed onto. Never recomputed, so
                  // nothing on it ever moves on its own. Tabs mode collapses it
                  // back to the screen, since a grid tiled across a desk would
                  // be one pane per postcode.
                  'absolute top-0 left-0 h-[5000px] w-[8000px]'
                : 'h-full w-full'
            }
          >
            {children}
          </div>
        </div>
      </div>

      {/* Centred on the SCREEN rather than on the desk, which is why it is out
          here rather than in dockview's watermark slot — see EmptyWorkspace. */}
      {empty ? <div className="absolute inset-0">{empty}</div> : null}

      {/* Above the windows, below the menus. dockview stacks a floating group at
          `--dv-overlay-z-index` (999) and climbs as you raise them; silica's
          portalled overlays sit at 10000 (see globals.css), and a menu opened
          from these controls has to clear them. */}
      {tools ? <div className="absolute right-4 bottom-4 z-[9000]">{tools}</div> : null}
    </div>
  );
}
