'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play, SkipForward, X } from 'lucide-react';

import { Button, Stack, useConfirm } from '@sparx/ui';

import {
  cancelSubscriptionAction,
  pauseSubscriptionAction,
  resumeSubscriptionAction,
  skipNextOccurrenceAction,
} from '../../../subscription-actions';

export function SubscriptionActionsBar({
  subscriptionId,
  status,
}: {
  subscriptionId: string;
  status: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();

  function onPause() {
    startTransition(async () => {
      const result = await pauseSubscriptionAction({ subscriptionId });
      if (!result.ok) {
        console.error('Pause failed', result.error);
        return;
      }
      router.refresh();
    });
  }

  function onResume() {
    startTransition(async () => {
      const result = await resumeSubscriptionAction({ subscriptionId });
      if (!result.ok) {
        console.error('Resume failed', result.error);
        return;
      }
      router.refresh();
    });
  }

  function onSkip() {
    void (async () => {
      const ok = await confirm({
        title: 'Skip next occurrence?',
        description:
          'The schedule advances by one interval. The customer is not charged for the skipped occurrence.',
        confirmLabel: 'Skip next',
        tone: 'warning',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await skipNextOccurrenceAction({ subscriptionId });
        if (!result.ok) {
          console.error('Skip failed', result.error);
          return;
        }
        router.refresh();
      });
    })();
  }

  function onCancel() {
    void (async () => {
      const ok = await confirm({
        title: 'Cancel subscription?',
        description:
          'Default is to honor the current period and stop renewing after. Toggle the option in code to cancel immediately.',
        confirmLabel: 'Cancel at period end',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await cancelSubscriptionAction({
          subscriptionId,
          atPeriodEnd: true,
        });
        if (!result.ok) {
          console.error('Cancel failed', result.error);
          return;
        }
        router.refresh();
      });
    })();
  }

  return (
    <Stack direction="row" gap={2}>
      {status === 'active' || status === 'trialing' ? (
        <Button variant="ghost" disabled={pending} onClick={onPause}>
          <Pause className="h-4 w-4" />
          Pause
        </Button>
      ) : status === 'paused' ? (
        <Button variant="secondary" disabled={pending} onClick={onResume}>
          <Play className="h-4 w-4" />
          Resume
        </Button>
      ) : null}
      {(status === 'active' || status === 'trialing') && (
        <Button variant="ghost" disabled={pending} onClick={onSkip}>
          <SkipForward className="h-4 w-4" />
          Skip next
        </Button>
      )}
      {status !== 'cancelled' && (
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel
        </Button>
      )}
    </Stack>
  );
}
