'use client';

// How much of the workspace fits on the screen.
//
// The trigger shows a percentage only when there IS one to show. At 100% it is
// just the glass, because a bar that reads "100%" all day teaches people to stop
// looking at it — and the whole job of this control at rest is to answer "why is
// everything small today?" the moment somebody asks.

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
import { ZOOM_STEPS, zoomPercent, type ZoomLevel } from '@/lib/window-zoom';
import { Check, Search } from 'lucide-react';

/** The one step that gets a word instead of a number, because it is the one
 *  somebody is looking for when they want out. */
function stepLabel(step: ZoomLevel): string {
  return step === 1 ? 'Normal size' : `${zoomPercent(step)}%`;
}

export function ZoomControl({
  zoom,
  onChangeZoom,
}: {
  zoom: ZoomLevel;
  onChangeZoom: (zoom: ZoomLevel) => void;
}) {
  const zoomed = zoom !== 1;

  return (
    <>
      {/* The reading sits BESIDE the button rather than inside it. A control
          that changes width with its value cannot be a circle, and a circle is
          what belongs in a round pill — so the number is plain text next to the
          glass it describes. Absent at 100%, because a bar that reads "100%" all
          day teaches people to stop looking at it, and answering "why is
          everything small today?" at a glance is this control's whole job at
          rest. */}
      {zoomed ? (
        <span className="pl-2 text-sm font-semibold tabular-nums">{zoomPercent(zoom)}%</span>
      ) : null}
      <DropdownMenu>
        <Tooltip content="Fit more on the screen, or make everything bigger">
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              shape="circle"
              aria-label={`Workspace size, currently ${stepLabel(zoom)}`}
            >
              <Search className="size-4 shrink-0" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        {/* Upward: the trigger is pinned to the bottom-right of the workspace,
          so anything opening downward would open off the screen. */}
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>How much fits on screen</DropdownMenuLabel>
            {ZOOM_STEPS.map((step) => (
              <DropdownMenuItem
                key={step}
                onClick={() => {
                  onChangeZoom(step);
                }}
              >
                {/* The tick keeps its space at every row, so the list does not
                  shuffle sideways as the choice moves down it. */}
                <Check
                  className={`size-3.5 shrink-0 ${step === zoom ? '' : 'invisible'}`}
                  aria-hidden
                />
                <span className={step === zoom ? 'font-semibold' : undefined}>
                  {stepLabel(step)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
