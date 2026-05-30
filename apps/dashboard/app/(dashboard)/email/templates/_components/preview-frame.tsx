'use client';

import { useState, useTransition } from 'react';
import { Monitor, Send, Smartphone } from 'lucide-react';
import { Button, Input, Stack, Text, toast } from '@sparx/ui';

import { testSendAuthoredAction, testSendBuiltinAction } from '../actions';

export type PreviewTarget = { kind: 'builtin'; key: string } | { kind: 'authored'; id: string };

export function PreviewFrame({ html, target }: { html: string; target: PreviewTarget }) {
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [to, setTo] = useState('');
  const [pending, startTransition] = useTransition();

  function sendTest() {
    if (!to.trim()) {
      toast.error('Enter a recipient email.');
      return;
    }
    startTransition(async () => {
      const result =
        target.kind === 'builtin'
          ? await testSendBuiltinAction(target.key, to.trim())
          : await testSendAuthoredAction(target.id, to.trim());
      if (result.ok) toast.success(`Test sent to ${to.trim()} (${result.data.provider}).`);
      else toast.error(result.error.message);
    });
  }

  return (
    <Stack gap={3}>
      <Stack direction="row" align="center" justify="between" gap={3} className="flex-wrap">
        <Stack direction="row" gap={1}>
          <Button
            variant={width === 'desktop' ? 'soft' : 'ghost'}
            size="sm"
            onClick={() => setWidth('desktop')}
          >
            <Monitor className="h-4 w-4" />
            Desktop
          </Button>
          <Button
            variant={width === 'mobile' ? 'soft' : 'ghost'}
            size="sm"
            onClick={() => setWidth('mobile')}
          >
            <Smartphone className="h-4 w-4" />
            Mobile
          </Button>
        </Stack>
        <Stack direction="row" align="center" gap={2}>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            disabled={pending}
            className="w-56"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={sendTest}
            loading={pending}
            disabled={pending}
          >
            <Send className="h-3.5 w-3.5" />
            Send test
          </Button>
        </Stack>
      </Stack>

      <div className="flex justify-center rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-4">
        <iframe
          title="Email preview"
          srcDoc={html}
          className="h-[640px] rounded-sm border border-[var(--color-border-default)] bg-white"
          style={{
            width: width === 'mobile' ? 375 : '100%',
            maxWidth: width === 'mobile' ? 375 : 680,
          }}
        />
      </div>
      <Text size="sm" variant="muted">
        Preview reflects the last saved version, rendered in your brand.
      </Text>
    </Stack>
  );
}
