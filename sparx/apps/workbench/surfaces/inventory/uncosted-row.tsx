'use client';

// One thing whose cost has never been recorded, and the box to record it in.

import { Input, Text } from '@wizeworks/silicaui-react';
import { formatCents, plural } from './data';
import type { UncostedVariant } from './uncosted-data';

/** What the entered cost works out to across everything held, shown live.
 *  Somebody typing 4200 for 62 garments should see $2,604.00 before they
 *  commit — a slipped decimal is obvious at the total and invisible per unit. */
function Extended({ costCents, onHand }: { costCents: number | null; onHand: number }) {
  if (costCents === null) return <span aria-hidden>—</span>;
  return <span className="tabular-nums">{formatCents(costCents * onHand)}</span>;
}

export function UncostedRow({
  item,
  value,
  onValue,
  onEnter,
}: {
  item: UncostedVariant;
  /** The raw text, not a number: an empty box is empty rather than a stray 0,
   *  and a half-typed "12." has to survive the keystroke after it. */
  value: string;
  onValue: (next: string) => void;
  onEnter: () => void;
}) {
  const parsed = value.trim() === '' ? null : Math.round(Number(value) * 100);
  const valid = parsed !== null && Number.isFinite(parsed) && parsed > 0;

  return (
    <tr>
      <td className="w-full max-w-0">
        <span className="flex min-w-0 flex-col">
          {/* The name WRAPS where the other two truncate. In a narrow pane every
              row read "Linen Shir…", which tells her nothing about which product
              she is pricing; the size and the code can lose their tails without
              costing her anything, because the size is short and the code is a
              reference rather than something she reads. */}
          <span className="font-medium break-words">{item.title}</span>
          {item.variantName ? <span className="truncate text-sm">{item.variantName}</span> : null}
          <span className="truncate font-mono text-sm">{item.sku ?? 'No code'}</span>
        </span>
      </td>
      <td className="text-right whitespace-nowrap tabular-nums">
        {plural(item.onHand, 'unit', 'units')}
      </td>
      {/* The selling price is the single most useful anchor when somebody is
          trying to remember what they paid, and it is the one figure they have
          already entered. It earns its column. */}
      <td className="hidden text-right whitespace-nowrap tabular-nums @lg:table-cell">
        {item.priceCents === null ? '—' : formatCents(item.priceCents)}
      </td>
      <td className="w-40">
        <Input
          color="module"
          size="sm"
          inputMode="decimal"
          placeholder="0.00"
          aria-label={`What one ${item.title} costs you`}
          value={value}
          onChange={(event) => {
            onValue(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter moves down the list rather than submitting: this is a long
            // typing job and the hands should never have to find the mouse.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            onEnter();
          }}
        />
      </td>
      <td className="hidden text-right whitespace-nowrap @xl:table-cell">
        <Text as="span" className="text-sm">
          <Extended costCents={valid ? parsed : null} onHand={item.onHand} />
        </Text>
      </td>
    </tr>
  );
}
