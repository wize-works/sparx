'use client';

// Attach-order popover for the deal detail. Pulls the most recent orders
// for the tenant, filters to ones not already attached, and calls
// attachOrderToDealAction on click. Detach reuses the same data path.

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

import { attachOrderToDealAction, detachOrderFromDealAction } from '../../../deal-actions';

interface OrderOption {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  currency: string;
}

interface AttachOrderPopoverProps {
  dealId: string;
  candidates: OrderOption[];
  attachedIds: string[];
}

export function AttachOrderPopover({ dealId, candidates, attachedIds }: AttachOrderPopoverProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const attached = new Set(attachedIds);
  const filtered = candidates
    .filter((o) => !attached.has(o.id))
    .filter((o) => o.orderNumber.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 25);

  function attach(orderId: string) {
    startTransition(async () => {
      const result = await attachOrderToDealAction({ dealId, orderId });
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not attach order');
        return;
      }
      toast.success('Order attached');
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
          Attach order
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-3" align="end">
        <Stack gap={2}>
          <Input
            placeholder="Filter by order number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <Text size="sm" variant="muted" className="py-4 text-center">
                No matching orders.
              </Text>
            ) : (
              <Stack gap={1}>
                {filtered.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => attach(o.id)}
                    disabled={pending}
                    className="flex items-center justify-between rounded-md p-2 text-left hover:bg-[var(--module-active-soft)] disabled:opacity-50"
                  >
                    <Stack direction="row" align="center" gap={2}>
                      <Link2 className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                      <Text size="sm" weight="medium">
                        {o.orderNumber}
                      </Text>
                      <Badge variant="outline" className="text-xs">
                        {o.status}
                      </Badge>
                    </Stack>
                    <Text size="xs" variant="muted" className="tabular-nums">
                      {o.currency} {Number(o.total).toLocaleString()}
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

export function DetachOrderButton({ dealId, orderId }: { dealId: string; orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function detach() {
    startTransition(async () => {
      const result = await detachOrderFromDealAction({ dealId, orderId });
      if (!result.ok) {
        toast.error(result.error.message ?? 'Could not detach order');
        return;
      }
      toast.success('Order detached');
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
      aria-label="Detach order"
    >
      <Unlink className="h-3.5 w-3.5" />
    </Button>
  );
}
