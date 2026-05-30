'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Stack, Text, Textarea } from '@sparx/ui';

import { updateTemplateAction } from '../../../configurator-actions';

interface InitialPayload {
  name: string;
  description?: string;
  layout: unknown;
  options: unknown[];
  rules: unknown[];
  addOns: unknown[];
}

export function TemplateJsonEditor({
  templateId,
  initial,
}: {
  templateId: string;
  initial: InitialPayload;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [json, setJson] = React.useState<string>(() => JSON.stringify(initial, null, 2));

  function onSave() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }
    startTransition(async () => {
      const result = await updateTemplateAction(templateId, parsed);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={3}>
      <Textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={20}
        className="font-mono text-xs"
      />
      {error && (
        <Text size="sm" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
      <Stack direction="row" gap={2} justify="end">
        <Button type="button" disabled={pending} onClick={onSave}>
          {pending ? 'Saving…' : 'Save definition'}
        </Button>
      </Stack>
    </Stack>
  );
}
