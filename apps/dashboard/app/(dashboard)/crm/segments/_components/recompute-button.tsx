'use client';

// Trigger a full segment recompute. Server-side this re-evaluates every
// customer against every active segment. Long-running — we surface a
// banner toast on completion.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { Button, toast, useConfirm } from '@sparx/ui';

import { recomputeSegmentsAction } from '../../segment-actions';

export function RecomputeButton({ segmentId }: { segmentId?: string } = {}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();

  async function run() {
    const ok = await confirm({
      title: 'Recompute segments?',
      description:
        'Safe to run, but may take a while on large tenants. We will re-evaluate every customer against every active segment.',
      confirmLabel: 'Recompute',
      tone: 'module',
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await recomputeSegmentsAction(segmentId);
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not recompute');
        return;
      }
      toast.success(
        `Scanned ${result.data.scanned} customers, ${result.data.changed} membership changes`
      );
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void run()}
      disabled={pending}
      loading={pending}
      leftIcon={!pending ? <RefreshCw className="h-3.5 w-3.5" /> : undefined}
    >
      Recompute
    </Button>
  );
}
