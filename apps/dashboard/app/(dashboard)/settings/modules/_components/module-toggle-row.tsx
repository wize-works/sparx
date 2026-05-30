'use client';

// One row in the modules list — label + description + an optimistic
// toggle. Calls setModuleEnabledAction; on success keeps the new state,
// on failure flips back and surfaces the error.

import * as React from 'react';
import { Badge, Button, Stack, Text } from '@sparx/ui';
import type { ModuleSlug } from '@sparx/auth';

import { setModuleEnabledAction } from '../actions';

interface ModuleToggleRowProps {
  slug: ModuleSlug;
  label: string;
  description: string;
  initialEnabled: boolean;
  disabled?: boolean;
}

export function ModuleToggleRow({
  slug,
  label,
  description,
  initialEnabled,
  disabled,
}: ModuleToggleRowProps) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onToggle(): void {
    setError(null);
    const next = !enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const res = await setModuleEnabledAction(slug, next);
      if (!res.ok) {
        setEnabled(!next); // revert
        setError(res.error.message);
      }
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
          <Text weight="medium">{label}</Text>
          {enabled ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          )}
        </Stack>
        <Text size="sm" variant="muted">
          {description}
        </Text>
        {error && (
          <Text size="xs" variant="danger" role="alert">
            {error}
          </Text>
        )}
      </Stack>
      <Button
        type="button"
        variant={enabled ? 'secondary' : 'module'}
        size="sm"
        onClick={onToggle}
        disabled={disabled === true || pending}
        loading={pending}
      >
        {enabled ? 'Deactivate' : 'Activate'}
      </Button>
    </Stack>
  );
}
