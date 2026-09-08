'use client';

// Full cart page body. Client component — reads the live cart from context,
// renders editable line items + an order summary with a discount-code field.

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@wizeworks/silicaui-react';

import { formatMoney } from '@/lib/format';
import { useCart } from './cart-provider';
import { QuantityStepper } from './quantity-stepper';
import { CodeField } from './code-field';
import { MadeToOrderSummary } from './made-to-order-summary';
import type { StorefrontPaymentMode } from '@/lib/made-to-order-copy';

export function CartView({
  /** Whether this website takes money at all. Handed down from the route rather
   *  than read from the cart: it is a fact about the SHOP, not about the basket,
   *  and the basket must not offer to charge a card that will never be charged
   *  (issue 185). */
  paymentMode = 'card',
}: {
  paymentMode?: StorefrontPaymentMode;
} = {}) {
  const {
    lines,
    totals,
    count,
    currency,
    updateItem,
    removeItem,
    appliedDiscountCodes,
    removeDiscount,
    appliedGiftCardCodes,
    removeGiftCard,
    madeToOrder,
  } = useCart();

  // Why a quantity change was refused, against the line it was refused on. A
  // shop can run out for the day (issue 026), and a stepper that silently snaps
  // back leaves somebody pressing "+" at a number that will not move.
  const [refused, setRefused] = useState<{ lineId: string; message: string } | null>(null);

  const changeQuantity = (lineId: string, quantity: number) => {
    setRefused(null);
    void updateItem(lineId, quantity).catch((err: unknown) => {
      setRefused({ lineId, message: (err as Error).message });
    });
  };

  if (lines.length === 0) {
    return (
      <div
        className="text-base-content grid place-items-center gap-3 px-6 py-[clamp(3rem,8vw,6rem)] text-center"
        style={{ minHeight: '40vh' }}
      >
        <span className="text-[2.5rem] opacity-50" aria-hidden="true">
          🛒
        </span>
        <h2 className="text-base-content text-3xl font-semibold tracking-tight">
          Your cart is empty
        </h2>
        <p className="text-base-content" style={{ margin: 0 }}>
          Browse the catalog and add something you like.
        </p>
        <Button render={<Link href="/products" style={{ marginTop: '0.5rem' }} />} color="primary">
          Shop all products
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-[clamp(1.5rem,4vw,3rem)] max-[860px]:grid-cols-1">
      <div>
        {lines.map((line) => (
          <div
            key={line.id}
            className="border-base-300 grid grid-cols-[88px_1fr_auto] items-start gap-4 border-b py-5 max-[520px]:grid-cols-[64px_1fr]"
          >
            {/* Sized by its COLUMN, not by a fixed 88px. The grid narrows its
                first track to 64px on a phone and the tile did not narrow with
                it, so it hung 24px into the text beside it — the first letter of
                every product name and every SKU sat underneath the picture
                (issue 186). `aspect-square` keeps it the shape it was. */}
            <div className="rounded-field bg-base-200 relative aspect-square w-full overflow-hidden">
              {line.imageUrl ? (
                <Image
                  src={line.imageUrl}
                  alt={line.title}
                  fill
                  sizes="88px"
                  style={{ objectFit: 'cover' }}
                />
              ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {line.productHandle ? (
                <Link
                  href={`/products/${line.productHandle}`}
                  className="card-title text-base-content"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  {line.title}
                </Link>
              ) : (
                <span className="card-title text-base-content">{line.title}</span>
              )}
              {line.variantTitle ? (
                <span className="text-base-content" style={{ fontSize: '0.85rem' }}>
                  {line.variantTitle}
                </span>
              ) : null}
              {line.sku ? (
                <span className="text-base-content" style={{ fontSize: '0.78rem' }}>
                  SKU: {line.sku}
                </span>
              ) : null}
              <div style={{ marginTop: '0.25rem' }}>
                <QuantityStepper
                  value={line.quantity}
                  onChange={(q) => {
                    changeQuantity(line.id, q);
                  }}
                  onRemove={() => removeItem(line.id)}
                />
              </div>
              {refused?.lineId === line.id ? (
                <span className="text-warning text-sm font-semibold">{refused.message}</span>
              ) : null}
              <button
                type="button"
                onClick={() => removeItem(line.id)}
                className="text-base-content"
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
              <div className="text-base-content" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                {formatMoney(line.unitPriceCents, currency)} ea
              </div>
            </div>
          </div>
        ))}
      </div>

      <aside
        className="rounded-box border-base-300 bg-base-100 flex flex-col gap-3 border p-6"
        style={{ position: 'sticky', top: '92px' }}
      >
        <h2 className="text-base-content text-2xl font-semibold">Order summary</h2>
        <div className="text-base-content flex justify-between text-sm">
          <span>Subtotal ({count} items)</span>
          <span>{formatMoney(totals.subtotalCents, currency)}</span>
        </div>
        {totals.discountTotalCents > 0 ? (
          <div className="text-success flex justify-between text-sm">
            <span>Discount</span>
            <span>−{formatMoney(totals.discountTotalCents, currency)}</span>
          </div>
        ) : null}
        {appliedDiscountCodes.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {appliedDiscountCodes.map((code) => (
              <span
                key={code}
                className="badge"
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

        {/* A gift card is money already paid, not a saving, so it reads as its own
            line. Leaving it out is what made the summary fail to add up: the rows
            a shopper could see came to more than the total under them. */}
        {totals.giftCardAppliedCents > 0 ? (
          <div className="text-success flex justify-between text-sm">
            <span>Gift card</span>
            <span>−{formatMoney(totals.giftCardAppliedCents, currency)}</span>
          </div>
        ) : null}
        {appliedGiftCardCodes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {appliedGiftCardCodes.map((code) => (
              <span key={code} className="badge inline-flex gap-2" style={{ position: 'static' }}>
                {code}
                <button
                  type="button"
                  aria-label={`Remove gift card ${code}`}
                  onClick={() => void removeGiftCard()}
                  className="cursor-pointer border-none bg-transparent text-inherit"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {totals.accountCreditAppliedCents > 0 ? (
          <div className="text-success flex justify-between text-sm">
            <span>Credit on your account</span>
            <span>−{formatMoney(totals.accountCreditAppliedCents, currency)}</span>
          </div>
        ) : null}

        <CodeField />

        <div className="border-base-300 text-base-content flex justify-between border-t pt-3 text-lg font-semibold">
          <span>Estimated total</span>
          <span>{formatMoney(totals.totalCents, currency)}</span>
        </div>
        <p className="text-base-content" style={{ fontSize: '0.8rem', margin: 0 }}>
          Shipping &amp; taxes calculated at checkout.
        </p>

        {/* The split, before the button rather than after it — a deposit
            changes what somebody is agreeing to (issue 026). */}
        <MadeToOrderSummary
          madeToOrder={madeToOrder}
          currency={currency}
          paymentMode={paymentMode}
        />
        <Button render={<Link href="/checkout" />} color="primary" size="lg" className="w-full">
          Proceed to checkout
        </Button>
        <Button
          render={<Link href="/products" />}
          color="neutral"
          variant="ghost"
          className="w-full"
        >
          Continue shopping
        </Button>
      </aside>
    </div>
  );
}
