'use client';

// Multi-step checkout: Contact → Shipping → Payment → Confirmation.
// Drives the public checkout API and Stripe Elements. The cart's ownership
// token (x-cart-token) is sent by the checkout-client helpers.

import Link from 'next/link';
import { useState } from 'react';

import { formatMoney } from '@/lib/format';
import {
  createPaymentIntent,
  quoteShipping,
  startCheckout,
  submitContact,
  submitShipping,
  type Address,
  type CheckoutSession,
  type ShippingRate,
} from '@/lib/checkout-client';
import { useCart } from '../cart-provider';
import { AddressForm, EMPTY_ADDRESS } from './address-form';
import { PaymentStep } from './payment-step';
import { OrderSummary } from './order-summary';

type Step = 'contact' | 'shipping' | 'payment' | 'done';

export function CheckoutFlow({ tenantSlug }: { tenantSlug: string }) {
  const cart = useCart();
  const [step, setStep] = useState<Step>('contact');
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);

  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [chosenRate, setChosenRate] = useState<ShippingRate | null>(null);

  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const cartReady = cart.cartId !== null;
  const cartEmpty = cartReady && cart.lines.length === 0;

  async function handleContact(e: React.FormEvent) {
    e.preventDefault();
    if (!cart.cartId) return;
    setBusy(true);
    setError(null);
    try {
      const s = session ?? (await startCheckout(tenantSlug, cart.cartId, email));
      const updated = await submitContact(tenantSlug, s.sessionId, { email, acceptsMarketing });
      setSession(updated);
      setStep('shipping');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleShipping(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      // First submit: quote rates for the entered destination + require a pick.
      if (rates.length === 0) {
        const quoted = await quoteShipping(tenantSlug, session.sessionId, {
          destinationCountry: address.country,
          destinationPostal: address.postalCode,
        });
        // Fall back to a single free standard option when the carrier engine
        // has no configured rates yet, so checkout still completes.
        const options =
          quoted.length > 0
            ? quoted
            : [
                {
                  providerSlug: 'manual',
                  rateRef: 'standard',
                  service: 'Standard shipping',
                  carrier: 'Standard',
                  amountCents: 0,
                  estimatedDays: null,
                },
              ];
        setRates(options);
        setChosenRate(options[0] ?? null);
        setBusy(false);
        return;
      }

      const rate = chosenRate ?? rates[0]!;
      const updated = await submitShipping(tenantSlug, session.sessionId, {
        shippingAddress: address,
        shippingRateRef: rate.rateRef,
        shippingProviderSlug: rate.providerSlug,
      });
      setSession(updated);
      setStep('payment');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handlePaid(orderNum: string) {
    setOrderNumber(orderNum);
    setStep('done');
    cart.reset();
  }

  if (cartEmpty && step !== 'done') {
    return (
      <div className="sf-empty" style={{ minHeight: '40vh' }}>
        <span className="sf-empty__icon" aria-hidden="true">
          🛒
        </span>
        <h2 className="sf-h2" style={{ color: 'var(--sf-text)' }}>
          Your cart is empty
        </h2>
        <Link href="/products" className="sf-btn sf-btn--primary">
          Shop all products
        </Link>
      </div>
    );
  }

  if (step === 'done' && orderNumber) {
    return <Confirmation orderNumber={orderNumber} />;
  }

  return (
    <div className="sf-checkout">
      <div className="sf-checkout__main">
        <StepIndicator step={step} />

        {error ? (
          <div className="sf-alert sf-alert--error" role="alert">
            {error}
          </div>
        ) : null}

        {step === 'contact' ? (
          <form onSubmit={handleContact} className="sf-form">
            <h2 className="sf-h2">Contact</h2>
            <label className="sf-field">
              <span>Email</span>
              <input
                className="sf-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <label className="sf-check">
              <input
                type="checkbox"
                checked={acceptsMarketing}
                onChange={(e) => setAcceptsMarketing(e.target.checked)}
              />
              Email me with news and offers
            </label>
            <button type="submit" className="sf-btn sf-btn--primary sf-btn--lg" disabled={busy}>
              {busy ? 'Saving…' : 'Continue to shipping'}
            </button>
          </form>
        ) : null}

        {step === 'shipping' ? (
          <form onSubmit={handleShipping} className="sf-form">
            <h2 className="sf-h2">Shipping address</h2>
            <AddressForm value={address} onChange={setAddress} />

            {rates.length > 0 ? (
              <fieldset className="sf-rates">
                <legend className="sf-h3">Shipping method</legend>
                {rates.map((rate) => (
                  <label key={rate.rateRef} className="sf-rate">
                    <input
                      type="radio"
                      name="rate"
                      checked={chosenRate?.rateRef === rate.rateRef}
                      onChange={() => setChosenRate(rate)}
                    />
                    <span style={{ flex: 1 }}>
                      <strong>{rate.service}</strong>
                      {rate.estimatedDays != null ? (
                        <span className="sf-muted"> · {rate.estimatedDays} days</span>
                      ) : null}
                    </span>
                    <span>
                      {rate.amountCents === 0
                        ? 'Free'
                        : formatMoney(rate.amountCents, session?.currency ?? 'USD')}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="sf-btn sf-btn--ghost"
                onClick={() => setStep('contact')}
              >
                ← Back
              </button>
              <button
                type="submit"
                className="sf-btn sf-btn--primary sf-btn--lg"
                style={{ flex: 1 }}
                disabled={busy}
              >
                {busy
                  ? 'Loading…'
                  : rates.length === 0
                    ? 'Get shipping rates'
                    : 'Continue to payment'}
              </button>
            </div>
          </form>
        ) : null}

        {step === 'payment' && session ? (
          <PaymentStep
            tenantSlug={tenantSlug}
            session={session}
            onBack={() => setStep('shipping')}
            onPaid={handlePaid}
            createIntent={() => createPaymentIntent(tenantSlug, session.sessionId)}
          />
        ) : null}
      </div>

      <aside className="sf-checkout__aside">
        <OrderSummary
          lines={cart.lines}
          totals={session?.totals ?? cart.totals}
          currency={session?.currency ?? cart.currency}
        />
      </aside>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'contact', label: 'Contact' },
    { key: 'shipping', label: 'Shipping' },
    { key: 'payment', label: 'Payment' },
  ];
  const order: Step[] = ['contact', 'shipping', 'payment', 'done'];
  const currentIdx = order.indexOf(step);
  return (
    <ol className="sf-steps">
      {steps.map((s, i) => {
        const idx = order.indexOf(s.key);
        const state = idx < currentIdx ? 'done' : idx === currentIdx ? 'current' : 'todo';
        return (
          <li key={s.key} className="sf-steps__item" data-state={state}>
            <span className="sf-steps__dot">{state === 'done' ? '✓' : i + 1}</span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function Confirmation({ orderNumber }: { orderNumber: string }) {
  return (
    <div className="sf-empty" style={{ minHeight: '50vh' }}>
      <span className="sf-empty__icon" aria-hidden="true">
        🎉
      </span>
      <h1 className="sf-h1" style={{ color: 'var(--sf-text)' }}>
        Order confirmed
      </h1>
      <p style={{ margin: 0 }}>
        Thank you! Your order <strong>{orderNumber}</strong> has been placed. A confirmation email
        is on its way.
      </p>
      <Link href="/products" className="sf-btn sf-btn--primary" style={{ marginTop: '0.5rem' }}>
        Continue shopping
      </Link>
    </div>
  );
}
