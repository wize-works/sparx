'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Stack, Text, Textarea } from '@sparx/ui';

import { respondToReviewAction } from '../../../review-actions';

export function RespondForm({
  reviewId,
  initial,
  respondedAt,
}: {
  reviewId: string;
  initial: string | null;
  respondedAt: string | null;
}) {
  const router = useRouter();
  const [response, setResponse] = React.useState(initial ?? '');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  function onSave() {
    if (!response.trim()) {
      setError('Response cannot be empty.');
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await respondToReviewAction({ reviewId, response: response.trim() });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Stack gap={3}>
      <Textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        rows={5}
        placeholder="Thanks for the feedback — we'll send out a replacement set right away."
      />
      <Stack direction="row" gap={2} justify="between" align="center">
        <Stack gap={0}>
          {respondedAt && (
            <Text size="xs" variant="muted">
              Last response: {new Date(respondedAt).toLocaleString()}
            </Text>
          )}
          {error && (
            <Text size="xs" className="text-[var(--color-danger)]">
              {error}
            </Text>
          )}
          {saved && !error && (
            <Text size="xs" className="text-[var(--color-success-text)]">
              Saved
            </Text>
          )}
        </Stack>
        <Button color="module" disabled={pending} onClick={onSave}>
          {initial ? 'Update response' : 'Post response'}
        </Button>
      </Stack>
    </Stack>
  );
}
