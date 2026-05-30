'use client';

// One row in the AI Integrations key list — prefix + scopes + last-used
// + revoke button (for active keys).

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { Badge, Button, Stack, Text, useConfirm } from '@sparx/ui';

import { revokeApiKeyAction } from '../actions';

interface ApiKeyRowProps {
  apiKey: {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  };
}

export function ApiKeyRow({ apiKey }: ApiKeyRowProps) {
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onRevoke() {
    startTransition(async () => {
      const ok = await confirm({
        title: `Revoke "${apiKey.name}"?`,
        description: 'Any integration using this key will stop working immediately.',
        confirmLabel: 'Revoke key',
        tone: 'danger',
      });
      if (!ok) return;
      setError(null);
      const res = await revokeApiKeyAction(apiKey.id);
      if (!res.ok) setError(res.error.message);
    });
  }

  return (
    <Stack
      direction="row"
      align="center"
      gap={3}
      className="rounded-md border border-[var(--color-border-default)] p-3"
    >
      <Stack gap={1} className="flex-1">
        <Stack direction="row" align="center" gap={2}>
          <Text weight="medium">{apiKey.name}</Text>
          {apiKey.revokedAt && <Badge variant="outline">Revoked</Badge>}
          {apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now() && (
            <Badge variant="outline">Expired</Badge>
          )}
        </Stack>
        <Stack direction="row" align="center" gap={2} className="flex-wrap">
          <code className="text-xs">{apiKey.keyPrefix}…</code>
          {apiKey.scopes.map((s) => (
            <Badge key={s} variant="outline" className="text-xs">
              <code>{s}</code>
            </Badge>
          ))}
        </Stack>
        <Text size="xs" variant="muted">
          Created {apiKey.createdAt.toLocaleDateString()} ·{' '}
          {apiKey.lastUsedAt ? `last used ${apiKey.lastUsedAt.toLocaleString()}` : 'never used'}
          {apiKey.expiresAt && ` · expires ${apiKey.expiresAt.toLocaleDateString()}`}
        </Text>
        {error && (
          <Text size="xs" variant="danger" role="alert">
            {error}
          </Text>
        )}
      </Stack>
      {!apiKey.revokedAt && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          disabled={pending}
          loading={pending}
          aria-label={`Revoke ${apiKey.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </Stack>
  );
}
