'use client';

import { useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, toast } from '@sparx/ui';

import { bootstrapAutomationsAction } from '../actions';

export function BootstrapButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      color="module"
      loading={pending}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await bootstrapAutomationsAction();
          if (result.ok) toast.success(`${result.data.automations} automations ready.`);
          else toast.error(result.error.message);
        })
      }
    >
      <Sparkles className="h-4 w-4" />
      Set up default automations
    </Button>
  );
}
