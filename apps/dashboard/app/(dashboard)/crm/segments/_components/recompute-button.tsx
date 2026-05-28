'use client';

// Trigger a full segment recompute. Server-side this re-evaluates every
// customer against every active segment. Long-running — we surface a
// banner toast on completion.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { Button, toast } from '@sparx/ui';

import { recomputeSegmentsAction } from '../../segment-actions';

export function RecomputeButton({ segmentId }: { segmentId?: string } = {}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run() {
    if (
      !confirm(
        'Recompute segments across every customer? Safe to run, but may take a while on large tenants.'
      )
    )
      return;
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
      onClick={run}
      disabled={pending}
      loading={pending}
      leftIcon={!pending ? <RefreshCw className="h-3.5 w-3.5" /> : undefined}
    >
      Recompute
    </Button>
  );
}
