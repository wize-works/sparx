'use client';

import type { LucideIcon } from 'lucide-react';

// Tidying up, for a workspace that has no grid to tidy into.
//
// It sits beside the windows/tabs toggle because it is the same kind of thing —
// a decision about the workspace rather than an action on anything in it — and
// it appears only in windows mode, where there is something to arrange. Tabs
// mode is already tidy by construction; an arrange menu there would offer to do
// what has already been done.

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Tooltip,
} from '@wizeworks/silicaui-react';
import type { ArrangeStyle } from '@/lib/window-arrange';
import { Copy, LayoutGrid, Shrink } from 'lucide-react';

// Named for what happens on screen, not for what the arrangement is called.
// "Cascade" and "tile" are words a window manager uses about itself; nobody
// running a shop has ever asked to cascade anything.
const CHOICES: { style: ArrangeStyle; label: string; hint: string; glyph: LucideIcon }[] = [
  {
    style: 'gather',
    label: 'Bring everything back',
    hint: 'Fetches anything parked off the side of the screen, and leaves the rest where it is',
    glyph: Shrink,
  },
  {
    style: 'cascade',
    label: 'Fan them out',
    hint: 'Stacks them stepped, so you can read every name at once',
    glyph: Copy,
  },
  {
    style: 'tile',
    label: 'Share the screen out',
    hint: 'Gives each one an equal piece, with nothing hidden behind anything',
    glyph: LayoutGrid,
  },
];

export function ArrangeMenu({ onArrange }: { onArrange: (style: ArrangeStyle) => void }) {
  return (
    <DropdownMenu>
      <Tooltip content="Tidy your windows up">
        <DropdownMenuTrigger>
          {/* Round, because the pill it sits in is. A square control inside a
              rounded container reads as two shapes fighting. */}
          <Button variant="ghost" shape="circle" aria-label="Tidy your windows up">
            <LayoutGrid className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      {/* Upward: the trigger is pinned to the bottom-right of the workspace,
          so anything opening downward would open off the screen. */}
      <DropdownMenuContent side="top" align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Tidy up</DropdownMenuLabel>
          {CHOICES.map((choice) => (
            <DropdownMenuItem
              key={choice.style}
              onClick={() => {
                onArrange(choice.style);
              }}
            >
              {/* Colorless, like the top bar's other chrome icons: these are
                  untyped actions on the workspace and belong to no app. */}
              <choice.glyph className="size-4 shrink-0" aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{choice.label}</span>
                {/* The hint is the whole point of the menu: three arrangements
                    named alone all read as "moves my windows somehow". Scale
                    separates it from the label; nothing here is faded. */}
                <span className="text-sm">{choice.hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
