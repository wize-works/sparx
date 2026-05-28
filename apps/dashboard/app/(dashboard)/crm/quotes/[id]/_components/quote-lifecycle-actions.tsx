'use client';

// Client-side lifecycle action bar for the quote detail page. Each button
// triggers a Server Action and updates the URL on success so the page
// re-fetches the new status.

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ArrowRight, Check, X, Clock, Send } from 'lucide-react';

import { Button, Stack, toast } from '@sparx/ui';

import {
  acceptQuoteAction,
  convertQuoteAction,
  declineQuoteAction,
  expireQuoteAction,
  submitQuoteAction,
} from '../../../quote-actions';

interface QuoteLifecycleActionsProps {
  quoteId: string;
  status: string;
}

export function QuoteLifecycleActions({ quoteId, status }: QuoteLifecycleActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    startTransition(async () => {
      const result = (await fn()) as { ok: boolean; error?: { message: string } };
      if (!result.ok) {
        toast.error(result.error?.message ?? `Could not ${label}`);
        return;
      }
      toast.success(`Quote ${label}`);
      router.refresh();
    });
  }

  return (
    <Stack direction="row" gap={2} wrap>
      {status === 'draft' && (
        <Button
          variant="module"
          leftIcon={<Send className="h-4 w-4" />}
          disabled={isPending}
          onClick={() => run('submitted', () => submitQuoteAction({ quoteId }))}
        >
          Submit
        </Button>
      )}
      {status === 'submitted' && (
        <>
          <Button
            variant="module"
            leftIcon={<Check className="h-4 w-4" />}
            disabled={isPending}
            onClick={() => run('accepted', () => acceptQuoteAction({ quoteId }))}
          >
            Accept
          </Button>
          <Button
            variant="secondary"
            leftIcon={<X className="h-4 w-4" />}
            disabled={isPending}
            onClick={() => run('declined', () => declineQuoteAction({ quoteId }))}
          >
            Decline
          </Button>
        </>
      )}
      {(status === 'submitted' || status === 'draft') && (
        <Button
          variant="ghost"
          leftIcon={<Clock className="h-4 w-4" />}
          disabled={isPending}
          onClick={() => run('expired', () => expireQuoteAction({ quoteId }))}
        >
          Expire
        </Button>
      )}
      {status === 'accepted' && (
        <Button
          variant="module"
          rightIcon={<ArrowRight className="h-4 w-4" />}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await convertQuoteAction({ quoteId });
              if (!result.ok) {
                toast.error(result.error.message ?? 'Could not convert quote');
                return;
              }
              toast.success(`Converted to order ${result.data.orderNumber}`);
              router.push(`/crm/orders/${result.data.orderId}`);
            })
          }
        >
          Convert to order
        </Button>
      )}
    </Stack>
  );
}
