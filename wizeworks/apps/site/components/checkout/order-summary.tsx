'use client';

// Checkout-side order summary. Mirrors the cart summary but read-only.

import Image from 'next/image';

import { formatMoney } from '@/lib/format';
import type { CartLine, CartMadeToOrder, CartTotals } from '../cart-provider';
import { MadeToOrderSummary } from '../made-to-order-summary';
import type { StorefrontPaymentMode } from '@/lib/made-to-order-copy';

export function OrderSummary({
  lines,
  totals,
  currency,
  surchargeLabel,
  madeToOrder,
  paymentMode = 'card',
  shippingSettled = true,
}: {
  lines: CartLine[];
  totals: CartTotals;
  currency: string;
  /** Label for the disclosed surcharge line (docs/48 §6), e.g. "Card processing fee". */
  surchargeLabel?: string;
  /** Made to order (issue 026). Absent on a checkout that predates it, which
   *  reads as an ordinary basket rather than as one with nothing to pay. */
  madeToOrder?: CartMadeToOrder;
  /** Whether this website takes money at all (issue 185). */
  paymentMode?: StorefrontPaymentMode;
  /**
   * Whether delivery has been WORKED OUT yet (issue 203’s cousin, issue 206).
   *
   * Zero shipping is two different answers: "this delivery is free" and "nobody
   * has chosen a delivery yet". Printing the second as Free told a shopper her
   * $128 order cost $128 on two screens, and $137 on the third.
   */
  shippingSettled?: boolean;
}) {
  const surchargeCents = totals.surchargeTotalCents ?? 0;
  return (
    <div
      className="rounded-box border-base-300 bg-base-100 flex flex-col gap-3 border p-6"
      style={{ position: 'sticky', top: '92px' }}
    >
      <h2 className="text-base-content text-2xl font-semibold">Order summary</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {lines.map((line) => (
          <div key={line.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div
              className="rounded-field bg-base-200 shrink-0 overflow-hidden"
              style={{ width: 56, height: 56, position: 'relative' }}
            >
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt={line.title}
                  fill
                  sizes="56px"
                  style={{ objectFit: 'cover' }}
                />
              ) : null}
              <span
                className="bg-primary text-primary-content absolute inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-1 text-[0.65rem] font-bold"
                style={{ top: -8, right: -8 }}
              >
                {line.quantity}
              </span>
            </div>
            <span style={{ flex: 1, fontSize: '0.9rem' }}>
              {line.title}
              {line.variantTitle ? (
                <span className="text-base-content"> · {line.variantTitle}</span>
              ) : null}
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {formatMoney(line.lineTotalCents, currency)}
            </span>
          </div>
        ))}
      </div>

      <div className="text-base-content flex justify-between text-sm">
        <span>Subtotal</span>
        <span>{formatMoney(totals.subtotalCents, currency)}</span>
      </div>
      {totals.discountTotalCents > 0 ? (
        <div className="text-success flex justify-between text-sm">
          <span>Discount</span>
          <span>−{formatMoney(totals.discountTotalCents, currency)}</span>
        </div>
      ) : null}
      <div className="text-base-content flex justify-between text-sm">
        <span>Shipping</span>
        <span>
          {!shippingSettled
            ? 'Once we know where'
            : totals.shippingTotalCents > 0
              ? formatMoney(totals.shippingTotalCents, currency)
              : 'Free'}
        </span>
      </div>
      {totals.taxTotalCents > 0 ? (
        <div className="text-base-content flex justify-between text-sm">
          <span>Tax</span>
          <span>{formatMoney(totals.taxTotalCents, currency)}</span>
        </div>
      ) : null}
      {surchargeCents > 0 ? (
        <div className="text-base-content flex justify-between text-sm">
          <span>{surchargeLabel ?? 'Surcharge'}</span>
          <span>{formatMoney(surchargeCents, currency)}</span>
        </div>
      ) : null}
      {/* Money already paid, taken off after tax because that is the order the
          total is built in. Both of these are inside totalCents already; without
          their own rows the summary silently failed to add up, and a shopper
          checking the sum found the page wrong rather than the total explained. */}
      {totals.giftCardAppliedCents > 0 ? (
        <div className="text-success flex justify-between text-sm">
          <span>Gift card</span>
          <span>−{formatMoney(totals.giftCardAppliedCents, currency)}</span>
        </div>
      ) : null}
      {totals.accountCreditAppliedCents > 0 ? (
        <div className="text-success flex justify-between text-sm">
          <span>Credit on your account</span>
          <span>−{formatMoney(totals.accountCreditAppliedCents, currency)}</span>
        </div>
      ) : null}
      <div className="border-base-300 text-base-content flex justify-between border-t pt-3 text-lg font-semibold">
        <span>{shippingSettled ? 'Total' : 'Total so far'}</span>
        <span>{formatMoney(totals.totalCents, currency)}</span>
      </div>

      {/* What the card is ACTUALLY charged, which on a deposit order is less
          than the total above. This is the last screen before paying, so the
          two numbers have to be on it together (issue 026). */}
      {madeToOrder ? (
        <MadeToOrderSummary
          madeToOrder={madeToOrder}
          currency={currency}
          paymentMode={paymentMode}
          settled
        />
      ) : null}
      {surchargeCents > 0 ? (
        <p className="text-base-content" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
          {surchargeLabel ?? 'A surcharge'} of {formatMoney(surchargeCents, currency)} is added to
          cover payment processing costs and is included in your total.
        </p>
      ) : null}
    </div>
  );
}
