'use client';

// Attach-quote popover for the deal detail. Mirrors attach-order-popover.

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Plus, Unlink } from 'lucide-react';

import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Stack,
  Text,
  toast,
} from '@sparx/ui';

import { attachQuoteToDealAction, detachQuoteFromDealAction } from '../../../deal-actions';

interface QuoteOption {
  id: string;
  quoteNumber: string;
  status: string;
  total: string;
  currency: string;
}

interface AttachQuotePopoverProps {
  dealId: string;
  candidates: QuoteOption[];
  attachedIds: string[];
}

export function AttachQuotePopover({ dealId, candidates, attachedIds }: AttachQuotePopoverProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const attached = new Set(attachedIds);
  const filtered = candidates
    .filter((q) => !attached.has(q.id))
    .filter((q) => q.quoteNumber.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 25);

  function attach(quoteId: string) {
    startTransition(async () => {
      const result = await attachQuoteToDealAction({ dealId, quoteId });
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not attach quote');
        return;
      }
      toast.success('Quote attached');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
          Attach quote
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-3" align="end">
        <Stack gap={2}>
          <Input
            placeholder="Filter by quote number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <Text size="sm" variant="muted" className="py-4 text-center">
                No matching quotes.
              </Text>
            ) : (
              <Stack gap={1}>
                {filtered.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => attach(q.id)}
                    disabled={pending}
                    className="flex items-center justify-between rounded-md p-2 text-left hover:bg-[var(--module-active-soft)] disabled:opacity-50"
                  >
                    <Stack direction="row" align="center" gap={2}>
                      <Link2 className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                      <Text size="sm" weight="medium">
                        {q.quoteNumber}
                      </Text>
                      <Badge variant="outline" className="text-xs">
                        {q.status}
                      </Badge>
                    </Stack>
                    <Text size="xs" variant="muted" className="tabular-nums">
                      {q.currency} {Number(q.total).toLocaleString()}
                    </Text>
                  </button>
                ))}
              </Stack>
            )}
          </div>
        </Stack>
      </PopoverContent>
    </Popover>
  );
}

export function DetachQuoteButton({ dealId, quoteId }: { dealId: string; quoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function detach() {
    startTransition(async () => {
      const result = await detachQuoteFromDealAction({ dealId, quoteId });
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not detach quote');
        return;
      }
      toast.success('Quote detached');
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={detach}
      disabled={pending}
      aria-label="Detach quote"
    >
      <Unlink className="h-3.5 w-3.5" />
    </Button>
  );
}
