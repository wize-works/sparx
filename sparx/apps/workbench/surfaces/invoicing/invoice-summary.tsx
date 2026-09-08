'use client';

// The running summary — the number the operator is actually building toward.
//
// In the old stacked form the total sat at the very bottom, below every line,
// so you had to scroll past the work to see what you were about to bill. Here
// it lives in the rail and PINS while the lines scroll, so the figure being
// checked never leaves the screen. It also owns the tax rate, because that is
// the one input whose whole job is to change the number right beside it.
//
// Everything recomputes locally as you type. `saved` is the server's last
// settled word on the same document; when it disagrees with the live total
// there are unsaved edits, and saying so plainly beats showing one figure and
// leaving the operator to guess which is real. Money is never faded — a total
// someone is about to charge a customer is the opposite of de-emphasised.

import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Text,
} from '@wizeworks/silicaui-react';
import { EDITOR_RAIL_STICKY } from '../../components/editor-layout';
import { computeTotals, type DraftLine } from './totals';
import { formatMoney } from './types';

interface SavedFigures {
  total: number;
  balance: number;
  amountPaid: number;
}

interface InvoiceSummaryProps {
  lines: DraftLine[];
  taxRate: number;
  currency: string;
  readOnly?: boolean;
  onTaxRateChange: (rate: number) => void;
  /** Document-level charges that are not lines and are not taxed: the delivery
   *  charge and any surcharge, carried across from the order. They are part of
   *  what the customer is asked for, so they belong in this block -- leaving
   *  them out made Total disagree with Amount due right beside it. */
  shippingTotal?: number;
  surchargeTotal?: number;
  /** The server's settled figures, once the document has been saved at least once. */
  saved?: SavedFigures;
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: React.ReactNode;
  value: string;
  strong?: boolean;
  tone?: 'danger' | 'success';
}) {
  const valueTone = tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : '';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <Text as="span" className={strong ? 'font-medium' : 'text-sm'}>
        {label}
      </Text>
      <Text
        as="span"
        className={`tabular-nums ${strong ? 'text-lg font-semibold' : ''} ${valueTone}`}
      >
        {value}
      </Text>
    </div>
  );
}

export function InvoiceSummary({
  lines,
  taxRate,
  currency,
  readOnly,
  onTaxRateChange,
  shippingTotal = 0,
  surchargeTotal = 0,
  saved,
}: InvoiceSummaryProps) {
  const totals = computeTotals(lines, taxRate, shippingTotal, surchargeTotal);
  const taxPct = (taxRate * 100).toFixed(2).replace(/\.?0+$/, '');
  const differs = saved !== undefined && Math.abs(saved.total - totals.total) >= 0.01;

  return (
    <section
      aria-label="Summary"
      className={`card bg-base-100 flex flex-col gap-4 p-4 ${EDITOR_RAIL_STICKY}`}
    >
      <Heading level={2} className="text-lg font-semibold">
        Summary
      </Heading>

      <Field>
        <FieldLabel>Tax rate</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              type="number"
              step={0.0001}
              min={0}
              max={1}
              value={taxRate}
              disabled={readOnly}
              className="text-right tabular-nums"
              onChange={(event) => {
                onTaxRateChange(Number(event.target.value) || 0);
              }}
            />
          }
        />
        <FieldDescription>As a decimal — 0.0875 is 8.75%</FieldDescription>
      </Field>

      <div className="border-base-300 flex flex-col gap-1 border-t pt-3">
        <Row label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
        {totals.discountTotal > 0 ? (
          <Row label="Discount" value={`−${formatMoney(totals.discountTotal, currency)}`} />
        ) : null}
        <Row
          label={taxRate > 0 ? `Tax (${taxPct}%)` : 'Tax'}
          value={formatMoney(totals.taxTotal, currency)}
        />
        {/* Only when there is one, the same rule the printed invoice follows: a
            "Delivery $0.00" row on a shop that does not deliver is a number
            nobody set. A charge that IS on the bill has to be visible, though --
            it was on none of these screens, so nine dollars simply appeared in
            the total with nothing to point at. */}
        {totals.shippingTotal > 0 ? (
          <Row label="Delivery" value={formatMoney(totals.shippingTotal, currency)} />
        ) : null}
        {totals.surchargeTotal > 0 ? (
          <Row label="Surcharge" value={formatMoney(totals.surchargeTotal, currency)} />
        ) : null}
        <div className="border-base-300 mt-1 border-t pt-2">
          <Row label="Total" value={formatMoney(totals.total, currency)} strong />
        </div>
      </div>

      {differs ? (
        <Text className="text-warning text-sm">
          Not saved yet — {formatMoney(saved.total, currency)} is what the customer would see today.
        </Text>
      ) : null}

      {/* Once saved, the money that has actually moved. Amount due is the figure
          an owner opens this document to check, so it carries the strong weight
          and a tone: red while owed, green when settled. */}
      {saved && (saved.amountPaid > 0 || saved.balance !== saved.total) ? (
        <div className="border-base-300 flex flex-col gap-1 border-t pt-3">
          <Row label="Paid" value={formatMoney(saved.amountPaid, currency)} />
          <Row
            label="Amount due"
            value={formatMoney(saved.balance, currency)}
            strong
            tone={saved.balance > 0 ? 'danger' : 'success'}
          />
        </div>
      ) : null}
    </section>
  );
}
