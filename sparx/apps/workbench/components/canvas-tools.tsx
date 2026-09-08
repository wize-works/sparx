'use client';

// The canvas's own controls, pinned to the bottom-right of the workspace.
//
// They belong ON the canvas rather than in the top bar because that is what they
// act on. The top bar is about the console — who you are, which business, what
// to open; these change what the workspace in front of you looks like, and a
// control for a thing should sit with the thing. It also keeps them where the
// hand already is: bottom-right is where you are when you have just finished
// dragging a window somewhere.
//
// Pinned to the FRAME, not the canvas, so scrolling the workspace does not carry
// them off the screen — see WindowCanvas for the layering.

import type { WindowMode } from '@/lib/window-mode';
import type { ArrangeStyle } from '@/lib/window-arrange';
import type { ZoomLevel } from '@/lib/window-zoom';
import { ArrangeMenu } from './arrange-menu';
import { ZoomControl } from './zoom-control';

export function CanvasTools({
  mode,
  zoom,
  onChangeZoom,
  onArrange,
}: {
  mode: WindowMode | null;
  zoom: ZoomLevel;
  onChangeZoom: (zoom: ZoomLevel) => void;
  onArrange: (style: ArrangeStyle) => void;
}) {
  return (
    // One lifted surface for both, on base-100 so it reads as sitting ABOVE the
    // windows rather than as another of them. The elevation is the whole
    // separation; there is no divider between the two, because two icons a gap
    // apart already read as two things.
    <div className="bg-base-100 border-base-300 flex items-center gap-1 rounded-full border p-1 shadow-lg">
      {/* Tidying is only an offer windows mode can make — tabs has no
          arrangement of its own to tidy. */}
      {mode === 'windows' ? <ArrangeMenu onArrange={onArrange} /> : null}
      <ZoomControl zoom={zoom} onChangeZoom={onChangeZoom} />
    </div>
  );
}
