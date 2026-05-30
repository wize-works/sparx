'use client';

import * as React from 'react';
import { Badge, Button, Heading, Stack, Text } from '@sparx/ui';
import { CreditCard } from 'lucide-react';
import { finishOnboardingAction } from '../_lib/actions';
import type { StepNav } from './onboarding-wizard';

// Payments is intentionally skip-primary for now: the store goes live without
// it (checkout stays disabled until a processor is connected). Stripe Connect
// OAuth is a flagged follow-on, so the connect button is present but disabled.
export function StepPayments({ nav }: { nav: StepNav }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onFinish() {
    setError(null);
    startTransition(async () => {
      const res = await finishOnboardingAction({});
      if (res.ok) nav.onNext();
      else setError(res.error);
    });
  }

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Heading level={3}>Connect payments</Heading>
        <Text variant="muted">
          Connect a processor to start taking orders. Your store can go live now and you can connect
          payments whenever you&apos;re ready — checkout simply stays off until then.
        </Text>
      </Stack>

      <div className="rounded-lg border border-[var(--color-border-default)] p-5">
        <Stack direction="row" align="center" justify="between" gap={3}>
          <Stack direction="row" align="center" gap={3}>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-bg-subtle)]">
              <CreditCard className="h-5 w-5 text-[var(--color-text-secondary)]" />
            </span>
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2}>
                <Text weight="medium">Stripe</Text>
                <Badge variant="outline">Coming soon</Badge>
              </Stack>
              <Text size="sm" variant="muted">
                Cards, wallets, and bank debits via Stripe Connect.
              </Text>
            </Stack>
          </Stack>
          <Button variant="secondary" disabled>
            Connect Stripe
          </Button>
        </Stack>
      </div>

      {error && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {error}
        </Text>
      )}

      <Stack direction="row" justify="between">
        <Button variant="ghost" onClick={nav.onBack} disabled={pending || nav.navPending}>
          Back
        </Button>
        <Button variant="module" onClick={onFinish} disabled={pending} loading={pending}>
          Finish setup
        </Button>
      </Stack>
    </Stack>
  );
}
