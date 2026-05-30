'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Power, Trash2 } from 'lucide-react';

import { Button, Stack, useConfirm } from '@sparx/ui';

import {
  setProviderEnabledAction,
  testProviderAction,
  uninstallProviderAction,
} from '../../../provider-actions';

export function ProviderActionsBar({
  installationId,
  enabled,
}: {
  installationId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [testResult, setTestResult] = React.useState<string | null>(null);

  function onToggle() {
    startTransition(async () => {
      const result = await setProviderEnabledAction({ installationId, enabled: !enabled });
      if (!result.ok) {
        console.error('Failed to toggle provider', result.error);
        return;
      }
      router.refresh();
    });
  }

  function onTest() {
    setTestResult(null);
    startTransition(async () => {
      const result = await testProviderAction(installationId);
      if (!result.ok) {
        setTestResult(`Failed: ${result.error.message}`);
        return;
      }
      setTestResult(
        result.data.ok ? `OK — ${result.data.details}` : `Test failed: ${result.data.details}`
      );
    });
  }

  function onUninstall() {
    void (async () => {
      const ok = await confirm({
        title: 'Uninstall provider?',
        description:
          'The credentials are detached and the platform stops dispatching to this provider. Webhook events still record but are not processed. You can reinstall later.',
        confirmLabel: 'Uninstall',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await uninstallProviderAction(installationId);
        if (!result.ok) {
          console.error('Failed to uninstall', result.error);
          return;
        }
        router.push('/commerce/providers');
      });
    })();
  }

  return (
    <Stack gap={1} align="end">
      <Stack direction="row" gap={2}>
        <Button variant="ghost" disabled={pending} onClick={onTest}>
          Test
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onToggle}>
          <Power className="h-4 w-4" />
          {enabled ? 'Disable' : 'Enable'}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onUninstall}>
          <Trash2 className="h-4 w-4" />
          Uninstall
        </Button>
      </Stack>
      {testResult && <span className="text-xs text-[var(--color-text-muted)]">{testResult}</span>}
    </Stack>
  );
}
