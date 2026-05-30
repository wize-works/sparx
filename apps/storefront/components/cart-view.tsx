'use client';

// Full cart page body. Client component — reads the live cart from context,
// renders editable line items + an order summary with a discount-code field.

import Link from 'next/link';

import { formatMoney } from '@/lib/format';
import { useCart } from './cart-provider';
import { QuantityStepper } from './quantity-stepper';
import { DiscountField } from './discount-field';

export function CartView() {
  const {
    lines,
    totals,
    count,
    currency,
    updateItem,
    removeItem,
    appliedDiscountCodes,
    removeDiscount,
  } = useCart();

  if (lines.length === 0) {
    return (
      <div className="sf-empty" style={{ minHeight: '40vh' }}>
        <span className="sf-empty__icon" aria-hidden="true">
          🛒
        </span>
        <h2 className="sf-h2" style={{ color: 'var(--sf-text)' }}>
          Your cart is empty
        </h2>
        <p style={{ margin: 0 }}>Browse the catalog and add something you like.</p>
        <Link href="/products" className="sf-btn sf-btn--primary" style={{ marginTop: '0.5rem' }}>
          Shop all products
        </Link>
      </div>
    );
  }

  return (
    <div className="sf-cart-grid">
      <div>
        {lines.map((line) => (
          <div key={line.id} className="sf-line">
            <div className="sf-line__media">
              {line.imageUrl ? <img src={line.imageUrl} alt={line.title} /> : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {line.productHandle ? (
                <Link
                  href={`/products/${line.productHandle}`}
                  className="sf-card__title"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  {line.title}
                </Link>
              ) : (
                <span className="sf-card__title">{line.title}</span>
              )}
              {line.variantTitle ? (
                <span className="sf-muted" style={{ fontSize: '0.85rem' }}>
                  {line.variantTitle}
                </span>
              ) : null}
              {line.sku ? (
                <span className="sf-muted" style={{ fontSize: '0.78rem' }}>
                  SKU: {line.sku}
                </span>
              ) : null}
              <div className="sf-line__qty" style={{ marginTop: '0.25rem' }}>
                <QuantityStepper
                  value={line.quantity}
                  onChange={(q) => updateItem(line.id, q)}
                  onRemove={() => removeItem(line.id)}
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(line.id)}
                className="sf-muted"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: '0.82rem',
                  textAlign: 'left',
                  textDecoration: 'underline',
                  width: 'fit-content',
                }}
              >
                Remove
              </button>
            </div>
            <div style={{ textAlign: 'right', fontWeight: 600 }}>
              {formatMoney(line.lineTotalCents, currency)}
              <div className="sf-muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                {formatMoney(line.unitPriceCents, currency)} ea
              </div>
            </div>
          </div>
        ))}
      </div>

      <aside className="sf-summary" style={{ position: 'sticky', top: '92px' }}>
        <h2 className="sf-h3">Order summary</h2>
        <div className="sf-summary__row">
          <span>Subtotal ({count} items)</span>
          <span>{formatMoney(totals.subtotalCents, currency)}</span>
        </div>
        {totals.discountTotalCents > 0 ? (
          <div className="sf-summary__row" style={{ color: 'var(--color-success-text)' }}>
            <span>Discount</span>
            <span>−{formatMoney(totals.discountTotalCents, currency)}</span>
          </div>
        ) : null}
        {appliedDiscountCodes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {appliedDiscountCodes.map((code) => (
              <span
                key={code}
                className="sf-badge"
                style={{ position: 'static', display: 'inline-flex', gap: '0.4rem' }}
              >
                {code}
                <button
                  type="button"
                  aria-label={`Remove ${code}`}
                  onClick={() => removeDiscount(code)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <DiscountField />

        <div className="sf-summary__total">
          <span>Estimated total</span>
          <span>{formatMoney(totals.totalCents, currency)}</span>
        </div>
        <p className="sf-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
          Shipping &amp; taxes calculated at checkout.
        </p>
        <Link href="/checkout" className="sf-btn sf-btn--primary sf-btn--block sf-btn--lg">
          Proceed to checkout
        </Link>
        <Link href="/products" className="sf-btn sf-btn--ghost sf-btn--block">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
