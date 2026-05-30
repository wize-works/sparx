'use client';

// Payment step — Stripe Elements. Creates a PaymentIntent via the public
// checkout API (which delegates to the merchant's Stripe account through the
// provider layer), mounts the Payment Element with the returned clientSecret,
// confirms in-browser, then records the payment ref + completes the order.
//
// Publishable key comes from NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { useEffect, useMemo, useState } from 'react';

import { formatMoney } from '@/lib/format';
import {
  completeCheckout,
  submitPayment,
  type CheckoutSession,
  type PaymentIntentResult,
} from '@/lib/checkout-client';

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

// Memoize the Stripe.js loader across mounts (loadStripe should run once).
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
}

export interface PaymentStepProps {
  tenantSlug: string;
  session: CheckoutSession;
  createIntent: () => Promise<PaymentIntentResult>;
  onBack: () => void;
  onPaid: (orderNumber: string) => void;
}

export function PaymentStep({
  tenantSlug,
  session,
  createIntent,
  onBack,
  onPaid,
}: PaymentStepProps) {
  const [intent, setIntent] = useState<PaymentIntentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    createIntent()
      .then((res) => {
        if (!cancelled) setIntent(res);
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
    // createIntent identity is stable per session in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stripe = useMemo(() => getStripe(), []);

  if (!PUBLISHABLE_KEY) {
    return (
      <div className="sf-alert sf-alert--error" role="alert">
        Payments aren’t configured for this store yet (missing Stripe publishable key).
      </div>
    );
  }

  if (error) {
    return (
      <div className="sf-form">
        <div className="sf-alert sf-alert--error" role="alert">
          {error}
        </div>
        <button type="button" className="sf-btn sf-btn--ghost" onClick={onBack}>
          ← Back to shipping
        </button>
      </div>
    );
  }

  if (!intent?.clientSecret) {
    return (
      <div className="sf-form">
        <h2 className="sf-h2">Payment</h2>
        <div className="sf-skeleton" style={{ height: 180 }} />
      </div>
    );
  }

  return (
    <Elements
      stripe={stripe}
      options={{ clientSecret: intent.clientSecret, appearance: { theme: 'stripe' } }}
    >
      <PaymentInner
        tenantSlug={tenantSlug}
        session={session}
        providerSlug={intent.providerSlug}
        paymentRef={intent.paymentRef}
        onBack={onBack}
        onPaid={onPaid}
      />
    </Elements>
  );
}

function PaymentInner({
  tenantSlug,
  session,
  providerSlug,
  paymentRef,
  onBack,
  onPaid,
}: {
  tenantSlug: string;
  session: CheckoutSession;
  providerSlug: string;
  paymentRef: string;
  onBack: () => void;
  onPaid: (orderNumber: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    try {
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (confirmError) {
        setError(confirmError.message ?? 'Payment could not be processed.');
        setBusy(false);
        return;
      }
      // Record the confirmed payment on the session, then finalize the order.
      await submitPayment(tenantSlug, session.sessionId, {
        paymentProviderSlug: providerSlug,
        paymentRef,
      });
      const result = await completeCheckout(tenantSlug, session.sessionId, paymentRef);
      onPaid(result.orderNumber);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={pay} className="sf-form">
      <h2 className="sf-h2">Payment</h2>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? (
        <div className="sf-alert sf-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" className="sf-btn sf-btn--ghost" onClick={onBack} disabled={busy}>
          ← Back
        </button>
        <button
          type="submit"
          className="sf-btn sf-btn--primary sf-btn--lg"
          style={{ flex: 1 }}
          disabled={!stripe || busy}
        >
          {busy ? 'Processing…' : `Pay ${formatMoney(session.totals.totalCents, session.currency)}`}
        </button>
      </div>
    </form>
  );
}
