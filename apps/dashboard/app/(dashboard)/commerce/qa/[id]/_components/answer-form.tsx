'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Stack, Text, Textarea } from '@sparx/ui';

import { submitOfficialAnswerAction } from '../../../review-actions';

export function AnswerForm({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState('');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit() {
    if (!body.trim()) {
      setError('Answer cannot be empty.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitOfficialAnswerAction({
        questionId,
        body: body.trim(),
        isOfficial: true,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setBody('');
      router.refresh();
    });
  }

  return (
    <Stack gap={2}>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Post an official answer as staff. The storefront pins official answers to the top."
      />
      <Stack direction="row" gap={2} justify="between" align="center">
        {error && (
          <Text size="xs" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Button color="module" disabled={pending} onClick={onSubmit} className="ml-auto">
          Post staff answer
        </Button>
      </Stack>
    </Stack>
  );
}
