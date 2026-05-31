'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';

import { Button, Stack, Text, useConfirm } from '@sparx/ui';

import { moderateQuestionAction } from '../../../review-actions';

export function QuestionModerateActions({
  questionId,
  status,
}: {
  questionId: string;
  status: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function decide(next: 'published' | 'rejected') {
    void (async () => {
      const ok = await confirm({
        title: `Mark question ${next}?`,
        description:
          next === 'published'
            ? 'Publishing makes the question visible on the storefront PDP.'
            : 'Rejected questions stay out of the storefront and the customer is not notified.',
        confirmLabel: next === 'published' ? 'Publish' : 'Reject',
        tone: next === 'published' ? 'module' : 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await moderateQuestionAction({ questionId, status: next });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.refresh();
      });
    })();
  }

  return (
    <Stack gap={1} align="end">
      <Stack direction="row" gap={2}>
        {status !== 'published' && (
          <Button color="module" disabled={pending} onClick={() => decide('published')}>
            <Check className="h-4 w-4" />
            Publish
          </Button>
        )}
        {status !== 'rejected' && (
          <Button variant="ghost" disabled={pending} onClick={() => decide('rejected')}>
            <X className="h-4 w-4" />
            Reject
          </Button>
        )}
      </Stack>
      {error && (
        <Text size="xs" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
    </Stack>
  );
}
