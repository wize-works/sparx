'use client';

// Checkout-side order summary. Mirrors the cart summary but read-only.

import { formatMoney } from '@/lib/format';
import type { CartLine, CartTotals } from '../cart-provider';

export function OrderSummary({
  lines,
  totals,
  currency,
}: {
  lines: CartLine[];
  totals: CartTotals;
  currency: string;
}) {
  return (
    <div className="sf-summary" style={{ position: 'sticky', top: '92px' }}>
      <h2 className="sf-h3">Order summary</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {lines.map((line) => (
          <div key={line.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div className="sf-line__media" style={{ width: 56, height: 56, position: 'relative' }}>
              {line.imageUrl ? <img src={line.imageUrl} alt={line.title} /> : null}
              <span className="sf-iconbtn__count" style={{ top: -8, right: -8 }}>
                {line.quantity}
              </span>
            </div>
            <span style={{ flex: 1, fontSize: '0.9rem' }}>
              {line.title}
              {line.variantTitle ? <span className="sf-muted"> · {line.variantTitle}</span> : null}
            </span>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              {formatMoney(line.lineTotalCents, currency)}
            </span>
          </div>
        ))}
      </div>

      <div className="sf-summary__row">
        <span>Subtotal</span>
        <span>{formatMoney(totals.subtotalCents, currency)}</span>
      </div>
      {totals.discountTotalCents > 0 ? (
        <div className="sf-summary__row" style={{ color: 'var(--color-success-text)' }}>
          <span>Discount</span>
          <span>−{formatMoney(totals.discountTotalCents, currency)}</span>
        </div>
      ) : null}
      <div className="sf-summary__row">
        <span>Shipping</span>
        <span>
          {totals.shippingTotalCents > 0
            ? formatMoney(totals.shippingTotalCents, currency)
            : 'Free'}
        </span>
      </div>
      {totals.taxTotalCents > 0 ? (
        <div className="sf-summary__row">
          <span>Tax</span>
          <span>{formatMoney(totals.taxTotalCents, currency)}</span>
        </div>
      ) : null}
      <div className="sf-summary__total">
        <span>Total</span>
        <span>{formatMoney(totals.totalCents, currency)}</span>
      </div>
    </div>
  );
}
