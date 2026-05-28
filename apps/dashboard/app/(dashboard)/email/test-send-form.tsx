'use client';

import * as React from 'react';
import {
  Badge,
  Button,
  Code,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
} from '@sparx/ui';
import { sendTestEmail, type DevLastSend, type TestSendResult } from './actions';

export interface TestSendFormProps {
  devLastSend: DevLastSend;
}

export function TestSendForm({ devLastSend }: TestSendFormProps) {
  const [template, setTemplate] = React.useState<'welcome-merchant' | 'password-reset'>(
    'welcome-merchant'
  );
  const [result, setResult] = React.useState<TestSendResult | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const formData = new FormData(e.currentTarget);
    formData.set('template', template);

    startTransition(async () => {
      const r = await sendTestEmail(formData);
      setResult(r);
    });
  }

  return (
    <Stack gap={4}>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap={4}>
          <Stack gap={2}>
            <Label htmlFor="to">Recipient</Label>
            <Input id="to" name="to" type="email" defaultValue="dev@example.test" required />
          </Stack>
          <Stack gap={2}>
            <Label htmlFor="template">Template</Label>
            <Select
              value={template}
              onValueChange={(v: string) => setTemplate(v as 'welcome-merchant' | 'password-reset')}
            >
              <SelectTrigger id="template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="welcome-merchant">Welcome (merchant)</SelectItem>
                <SelectItem value="password-reset">Password reset</SelectItem>
              </SelectContent>
            </Select>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button type="submit" variant="module" disabled={pending} loading={pending}>
              Send test
            </Button>
          </Stack>
        </Stack>
      </form>

      {result?.ok && result.send && (
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={2}>
            <Badge variant="success">Accepted</Badge>
            <Text size="sm">
              <Code>{result.send.templateId}</Code> → {result.send.to}
            </Text>
          </Stack>
          <Text size="xs" variant="muted">
            id <Code>{result.send.id}</Code> · via <Code>{result.send.provider}</Code> ·{' '}
            {new Date(result.send.acceptedAt).toLocaleString()}
          </Text>
        </Stack>
      )}

      {result && !result.ok && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {result.error ?? 'Send failed.'}
        </Text>
      )}

      {devLastSend.enabled && devLastSend.send && (
        <Stack gap={1}>
          <Text size="xs" weight="medium">
            Last dev send
          </Text>
          <Text size="xs" variant="muted">
            <Code>{devLastSend.send.templateId ?? 'unknown'}</Code> → {devLastSend.send.to} ·{' '}
            {new Date(devLastSend.send.acceptedAt).toLocaleString()}
          </Text>
          <Text size="xs" variant="muted">
            Subject: {devLastSend.send.subject}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
