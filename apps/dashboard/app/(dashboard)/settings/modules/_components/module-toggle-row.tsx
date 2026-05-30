'use client';

// One row in the modules list — label + description + an optimistic
// toggle. Calls setModuleEnabledAction; on success keeps the new state and
// fires a confirmation toast, on failure flips back and surfaces the error
// both inline and via a toast.
//
// The await is wrapped in try/catch because Server Actions can throw
// outright (auth expiry, transport failure, an uncaught error in the
// action) — without the catch the rejected promise would leave the
// optimistic state stuck on "Active" with no error shown, which is the
// failure mode the CRM audit (F-01) repro'd on prod.

import * as React from 'react';
import { Badge, Button, Stack, Text, toast } from '@sparx/ui';
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
      try {
        const res = await setModuleEnabledAction(slug, next);
        if (res.ok) {
          toast.success(next ? `${label} activated` : `${label} deactivated`, {
            description: next
              ? 'API surface and dashboard routes are live for this tenant.'
              : 'API surface returns MODULE_DISABLED; consumers stop.',
          });
          return;
        }
        setEnabled(!next); // revert
        setError(res.error.message);
        toast.error(`Couldn't ${next ? 'activate' : 'deactivate'} ${label}`, {
          description: res.error.message,
        });
      } catch (err) {
        // Server Action threw outright (auth expiry, network, uncaught
        // server error). Without this branch the optimistic state would
        // be stuck — see F-01 in docs/crm-audit-2026-05-29.md.
        setEnabled(!next); // revert
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error(`Couldn't ${next ? 'activate' : 'deactivate'} ${label}`, {
          description: message,
        });
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
