'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Flag, Trash2, X } from 'lucide-react';

import { Button, Stack, Text, useConfirm } from '@sparx/ui';

import { deleteReviewAction, moderateReviewAction } from '../../../review-actions';

type Status = 'pending' | 'approved' | 'rejected' | 'flagged';

export function ModerateActions({ reviewId, status }: { reviewId: string; status: Status }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function moderate(next: Status, requireNote = false, tone: 'danger' | 'warning' = 'warning') {
    void (async () => {
      const ok = await confirm({
        title: `Mark review as ${next}?`,
        description:
          next === 'approved'
            ? 'Approving publishes the review on the storefront immediately.'
            : next === 'rejected'
              ? 'Rejected reviews are hidden from the storefront and the customer.'
              : 'Flagged reviews stay in the queue and surface in the alerts strip.',
        confirmLabel: next.charAt(0).toUpperCase() + next.slice(1),
        tone,
      });
      if (!ok) return;
      let note: string | undefined;
      if (requireNote) {
        const raw = window.prompt('Moderation note (internal)?') ?? '';
        if (!raw.trim()) return;
        note = raw.trim();
      }
      startTransition(async () => {
        const result = await moderateReviewAction({
          reviewId,
          status: next,
          ...(note ? { moderationNote: note } : {}),
        });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.refresh();
      });
    })();
  }

  function onDelete() {
    void (async () => {
      const ok = await confirm({
        title: 'Delete review?',
        description: 'Soft-deletes the review. It will not appear in any storefront or report.',
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await deleteReviewAction(reviewId);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.push('/commerce/reviews');
        router.refresh();
      });
    })();
  }

  return (
    <Stack gap={1} align="end">
      <Stack direction="row" gap={2}>
        {status !== 'approved' && (
          <Button variant="primary" disabled={pending} onClick={() => moderate('approved')}>
            <Check className="h-4 w-4" />
            Approve
          </Button>
        )}
        {status !== 'flagged' && (
          <Button variant="secondary" disabled={pending} onClick={() => moderate('flagged')}>
            <Flag className="h-4 w-4" />
            Flag
          </Button>
        )}
        {status !== 'rejected' && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => moderate('rejected', true, 'danger')}
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
        )}
        <Button variant="ghost" disabled={pending} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </Stack>
      {error && (
        <Text size="xs" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
    </Stack>
  );
}
