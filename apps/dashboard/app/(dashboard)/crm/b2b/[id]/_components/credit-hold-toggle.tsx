'use client';

// Inline credit-hold toggle on the B2B account detail. Flips status
// between 'active' and 'credit_hold'; the dedicated 'closed' status stays
// out of this control to avoid an accidental archive from one click.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pause, Play } from 'lucide-react';

import { Button, toast, useConfirm } from '@sparx/ui';

import { setB2bAccountStatusAction } from '../../../b2b-actions';

interface CreditHoldToggleProps {
  accountId: string;
  currentStatus: string;
}

export function CreditHoldToggle({ accountId, currentStatus }: CreditHoldToggleProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const onHold = currentStatus === 'credit_hold';

  async function toggle() {
    const next = onHold ? 'active' : 'credit_hold';
    if (next === 'credit_hold') {
      const ok = await confirm({
        title: 'Put this account on credit hold?',
        description: 'New orders and quotes will block until you release the hold.',
        confirmLabel: 'Put on hold',
        tone: 'warning',
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await setB2bAccountStatusAction(accountId, next);
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not change status');
        return;
      }
      toast.success(next === 'credit_hold' ? 'Account on credit hold' : 'Account released');
      router.refresh();
    });
  }

  if (currentStatus === 'suspended' || currentStatus === 'inactive') return null;

  return (
    <Button
      variant={onHold ? 'module' : 'secondary'}
      size="sm"
      onClick={() => void toggle()}
      disabled={pending}
      leftIcon={onHold ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
    >
      {onHold ? 'Release credit hold' : 'Put on credit hold'}
    </Button>
  );
}
