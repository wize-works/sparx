'use client';

// One thing a shopper can pick under an option — the text, its color dot if it
// is a swatch, and the controls to move or drop it.
//
// Enter adds the next one and moves the cursor into it, so a list of sizes is
// typed like a list rather than clicked out one row at a time (issue 168).

import { useEffect, useRef } from 'react';
import { Badge, Button, Input } from '@wizeworks/silicaui-react';
import { faChevronDown, faChevronUp, faXmark } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { SwatchPicker } from '../../components/swatch-picker';
import type { ValueDraft } from './product-options-draft';

export function ValueRow({
  value,
  swatch,
  optionName,
  focus,
  canMoveUp,
  canMoveDown,
  onChange,
  onEnter,
  onMove,
  onRemove,
}: {
  value: ValueDraft;
  swatch: boolean;
  optionName: string;
  /** Put the cursor here — true only on the row that was just created. */
  focus: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (change: Partial<ValueDraft>) => void;
  onEnter: () => void;
  onMove: (direction: 1 | -1) => void;
  onRemove: () => void;
}) {
  const label = value.value.trim() || 'this option';

  // Moved rather than declared with `autoFocus`, which fires on mount whatever
  // caused it. This only ever follows a deliberate act — Enter, or the button.
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) field.current?.focus();
  }, [focus]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        ref={field}
        color="module"
        size="sm"
        className="min-w-32 flex-1"
        value={value.value}
        placeholder="Medium"
        aria-label={`An option under ${optionName}`}
        // Nothing here is inside a <form>, so Enter has no other meaning to
        // take away — it is free to mean what it means in every other list.
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          onEnter();
        }}
        onChange={(event) => {
          onChange({ value: event.target.value });
        }}
      />

      {/* THE SWATCH. `swatchHex` is user DATA — the color of the product — so it
          cannot come from a token, and a runtime hex can never become a Tailwind
          class (the compiler only ever sees literals in source). ColorPicker's
          `swatch` variant is the sanctioned answer: the library paints the chip
          from the value, which is exactly where painting belongs. SwatchPicker
          is that, plus the Escape repair described in its own file. */}
      {swatch ? (
        <>
          <SwatchPicker
            value={value.swatchHex ?? null}
            label={label}
            onValueChange={(next) => {
              onChange({ swatchHex: next });
            }}
          />
          {value.swatchHex ? null : (
            // Without this the picker's own default color reads as the answer,
            // and someone saves a swatch that shows nothing on their website.
            <Badge color="warning" variant="soft" size="sm">
              No color picked
            </Badge>
          )}
        </>
      ) : null}

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          shape="square"
          aria-label={`Move ${label} up`}
          disabled={!canMoveUp}
          onClick={() => {
            onMove(-1);
          }}
        >
          <Icon glyph={faChevronUp} className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          shape="square"
          aria-label={`Move ${label} down`}
          disabled={!canMoveDown}
          onClick={() => {
            onMove(1);
          }}
        >
          <Icon glyph={faChevronDown} className="size-4" aria-hidden />
        </Button>
        {/* No confirm here on purpose: nothing is destroyed until the commit, and
            a dialog on every removed row would train people to click straight
            through the one dialog that DOES matter. */}
        <Button size="sm" shape="square" aria-label={`Remove ${label}`} onClick={onRemove}>
          <Icon glyph={faXmark} className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
