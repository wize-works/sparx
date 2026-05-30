'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import { Button, Stack, useConfirm } from '@sparx/ui';

import { deleteTemplateAction, updateTemplateAction } from '../../../configurator-actions';

export function TemplateStatusBar({ templateId, status }: { templateId: string; status: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function updateStatus(next: 'draft' | 'active' | 'archived') {
    setError(null);
    startTransition(async () => {
      const result = await updateTemplateAction(templateId, { status: next });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function onDelete() {
    void (async () => {
      const ok = await confirm({
        title: 'Delete configurator template?',
        description:
          'Deletes the template, its options, rules, and add-ons. Cart items that already reference this template keep their stored payload.',
        confirmLabel: 'Delete template',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await deleteTemplateAction(templateId);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.push('/commerce/configurator');
      });
    })();
  }

  return (
    <Stack direction="row" gap={2} align="center">
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      {status !== 'active' && (
        <Button variant="secondary" disabled={pending} onClick={() => updateStatus('active')}>
          Activate
        </Button>
      )}
      {status === 'active' && (
        <Button variant="ghost" disabled={pending} onClick={() => updateStatus('draft')}>
          Move to draft
        </Button>
      )}
      {status !== 'archived' && (
        <Button variant="ghost" disabled={pending} onClick={() => updateStatus('archived')}>
          Archive
        </Button>
      )}
      <Button variant="ghost" disabled={pending} onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </Stack>
  );
}
