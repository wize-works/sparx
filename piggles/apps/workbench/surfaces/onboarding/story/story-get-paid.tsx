'use client';

import { type ReactNode } from 'react';
import { Button, FieldStatus, Heading, Text } from '@wizeworks/silicaui-react';
import { faCheckCircle } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { industryOf, type StoryState } from '@wizeworks/story-schemas';
import type { OnboardingActions } from '../../../lib/onboarding/api';
import { useStripeConnect } from '../../../lib/onboarding/use-stripe-connect';

// The story's "get paid" chapter — the SAME beat the classic wizard calls Payments,
// but told as the next line of the owner's story instead of a bare integration tile.
// It names what they just built and frames connecting Stripe as the last piece of the
// narrative, in the compose phase's own voice + surface. The Stripe handshake itself
// is the shared `useStripeConnect` hook; this is only how the story tells it.

function subject(story: StoryState): string {
  // "a salon" → "Your salon"; the generic fallback stays "Your business".
  const noun = story.industry ? industryOf(story.industry).noun : 'a business';
  return `Your ${noun.replace(/^an? /, '')}`;
}

export function StoryGetPaid({
  story,
  connected,
  actions,
  onConnected,
}: {
  story: StoryState;
  connected: boolean;
  actions: OnboardingActions;
  onConnected: () => void;
}): ReactNode {
  const { connect, connecting, error } = useStripeConnect(actions, onConnected);

  return (
    <div className="flex min-w-0 flex-col gap-7">
      <div className="flex flex-col gap-2.5">
        <Heading level={2} className="text-2xl font-semibold tracking-tight">
          Now, let’s get you paid
        </Heading>
        <Text className="max-w-[58ch] text-base">
          {subject(story)} is set up and ready to sell. The last line of your story is getting the
          money into your hands — connect your bank through Stripe and you can take payments the
          moment you go live. Not today? Go live now and add it whenever you’re ready — checkout
          simply waits until you do.
        </Text>
      </div>

      {connected ? (
        <div className="border-success flex items-start gap-3 rounded-xl border px-5 py-4">
          <Icon glyph={faCheckCircle} className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
          <Text className="max-w-[58ch] text-base">
            You’re set to get paid — Stripe is connected and checkout is ready. Money from your
            customers lands straight in your bank account.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <Button color="module" size="lg" onClick={connect} loading={connecting}>
            Connect Stripe
          </Button>
          <Text className="max-w-[58ch] text-sm">
            Stripe is how the money reaches you — cards, wallets, and bank debits, paid straight to
            your bank. It’s the account that <span className="font-medium">receives</span> customer
            payments, separate from what you pay us each month.
          </Text>
        </div>
      )}

      {error ? <FieldStatus status="error">{error}</FieldStatus> : null}
    </div>
  );
}
