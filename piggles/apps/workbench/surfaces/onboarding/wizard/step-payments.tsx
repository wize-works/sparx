'use client';

// Step 5 — Payments (the work pane). Shown ONLY when a selling module is on. It
// connects Stripe Connect — the account that RECEIVES customer money, which the note
// makes clear is separate from the tenant's own sparx subscription. The handshake
// (popup + postMessage + code exchange) lives in `useStripeConnect`, shared with the
// story flow's "get paid" chapter; this is just the wizard's presentation of it.

import { Badge, Button, FieldStatus } from '@wizeworks/silicaui-react';
import { faCheckCircle, faCircleInfo, faCreditCard } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import type { OnboardingActions } from '../../../lib/onboarding/api';
import { useStripeConnect } from '../../../lib/onboarding/use-stripe-connect';

export function StepPayments({
  connected,
  actions,
  onConnected,
}: {
  connected: boolean;
  actions: OnboardingActions;
  onConnected: () => void;
}) {
  const { connect, connecting, error } = useStripeConnect(actions, onConnected);

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="border-base-300 bg-base-100 rounded-xl border p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-base-200 flex size-11 items-center justify-center rounded-lg">
              {connected ? (
                <Icon glyph={faCheckCircle} className="text-success size-5" aria-hidden />
              ) : (
                <Icon glyph={faCreditCard} className="size-5" aria-hidden />
              )}
            </span>
            <div className="min-w-0">
              <span className="flex items-center gap-2">
                <p className="font-medium">Stripe</p>
                {connected ? (
                  <Badge color="success" variant="soft" size="sm">
                    Connected
                  </Badge>
                ) : null}
              </span>
              <p className="text-sm">
                {connected
                  ? 'Your Stripe account is connected — checkout is ready to take payments.'
                  : 'Cards, wallets, and bank debits — paid out straight to your bank.'}
              </p>
            </div>
          </div>
          {!connected ? (
            <Button
              variant="outline"
              color="module"
              onClick={connect}
              disabled={connecting}
              loading={connecting}
            >
              Connect Stripe
            </Button>
          ) : null}
        </div>

        <div className="border-base-300 mt-4 flex items-start gap-2.5 border-t pt-4">
          <Icon glyph={faCircleInfo} className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            This is the account that{' '}
            <span className="font-medium">receives money from your customers</span> — separate from
            what you pay us each month. You can connect it now or come back to it later; checkout
            simply stays off until you do.
          </p>
        </div>
      </div>

      {error ? <FieldStatus status="error">{error}</FieldStatus> : null}
    </div>
  );
}
