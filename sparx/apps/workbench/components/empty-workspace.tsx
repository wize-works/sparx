'use client';

// Nothing open.
//
// dockview has a watermark slot for exactly this and it is the wrong tool here:
// it renders whenever there is no GRID group, which in windows mode is always,
// so it would sit behind every window all day — and it centres itself in the
// dockview container, which is the 8000×5000 desk rather than the screen. Its
// default is an empty div, which is why nobody has seen it.
//
// So this is pinned to the FRAME instead, beside the canvas tools, and shown
// only when the workspace is genuinely empty.

import { Kbd } from '@wizeworks/silicaui-react';
import { LayoutGrid } from 'lucide-react';

export function EmptyWorkspace() {
  return (
    // Untouchable: the ground behind it still pans, and somebody reaching past
    // it to drag the canvas should not be stopped by a picture.
    <div className="pointer-events-none grid h-full place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {/* The same glyph the empty DOCK uses, so the two presentations agree
            about what "nothing open" looks like. The other console draws a
            brand character here; this one has no cast, and a chip is the honest
            answer rather than a borrowed one. */}
        <span className="bg-base-200 text-base-content grid size-16 place-items-center rounded-2xl">
          <LayoutGrid className="size-8" aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          {/* The heading carries itself; there is nothing above it. */}
          <h2 className="text-xl font-semibold">Nothing open yet</h2>
          <p className="text-base">
            Pick an app on the left to get started, or press <Kbd>⌘K</Kbd> and say what you want to
            do.
          </p>
        </div>
      </div>
    </div>
  );
}
