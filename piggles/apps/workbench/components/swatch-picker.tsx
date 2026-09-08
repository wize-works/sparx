'use client';

// THE color chip. Anywhere somebody picks a color that belongs to their own
// business — a swatch under an option, a tag, a label — this is what they press.
//
// It is `<ColorPicker variant="swatch">` plus one repair.
//
// ── The repair: Escape used to throw the typed color away ─────────────────
//
// The picker's panel commits every slider LIVE — drag Hue and the color changes
// under your hand, and closing the panel keeps it. The HEX box does not: it
// keeps a draft and commits on Enter or on blur. Escape closes the popover, the
// box unmounts without ever blurring, and the draft goes with it.
//
// So somebody types the color from their brand sheet, presses Escape because
// they are finished, and the chip keeps the color they were replacing. Nothing
// says so. It cost a real color on a real product (P03 act 108).
//
// Escape is not a cancel here — it cannot be, since the sliders have already
// been applied. It only means "close". This makes the HEX box agree with the
// rest of its own panel: on the way out, the field is blurred first, which runs
// the picker's OWN commit. Nothing is parsed or re-implemented here.
//
// This belongs upstream in `@wizeworks/silicaui-react` (its ColorPicker should
// commit its hex draft on unmount). When it does, delete this file and go back
// to `<ColorPicker variant="swatch">` at the two call sites.

import { ColorPicker } from '@wizeworks/silicaui-react';

export function SwatchPicker({
  value,
  label,
  onValueChange,
}: {
  /** The color, or null when nobody has picked one yet. */
  value: string | null;
  /** What this color is FOR, read out as "Color for Moss". */
  label: string;
  onValueChange: (hex: string) => void;
}) {
  return (
    // Capture, so the field is settled before the popover reads the same key and
    // starts closing. The event is not stopped: Escape still closes the panel,
    // which is what the person pressing it asked for.
    <div
      className="contents"
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') return;
        const focused = document.activeElement;
        if (focused instanceof HTMLInputElement) focused.blur();
      }}
    >
      <ColorPicker
        variant="swatch"
        format="hex"
        {...(value ? { value } : {})}
        aria-label={`Color for ${label}`}
        onValueChange={(next) => {
          onValueChange(next);
        }}
      />
    </div>
  );
}
