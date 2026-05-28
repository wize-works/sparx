'use client';

// New-order form. The customer picker + line-items repeater carry the
// bulk of the input shape; channel/source/notes are header-level fields.
// Items are validated server-side via @sparx/crm-schemas — we surface any
// per-field errors back into the form.

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createOrderAction } from '../../../order-actions';
import { LineItemsEditor, type LineItem } from '../../../_components/line-items-editor';

interface NewOrderFormProps {
  customers: { id: string; label: string }[];
  preselectedCustomerId: string | null;
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export function NewOrderForm({ customers, preselectedCustomerId }: NewOrderFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [items, setItems] = React.useState<LineItem[]>([
    { sku: '', name: '', quantity: 1, unitPrice: 0, taxAmount: 0, discountAmount: 0 },
  ]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const input = {
      customerId: form.get('customerId') as string,
      channel: nonEmpty(form.get('channel')),
      source: nonEmpty(form.get('source')),
      currency: (nonEmpty(form.get('currency')) ?? 'USD').toUpperCase(),
      shippingTotal: numOrZero(form.get('shippingTotal')),
      customerNote: nonEmpty(form.get('customerNote')),
      internalNote: nonEmpty(form.get('internalNote')),
      items,
    };

    startTransition(async () => {
      const result = await createOrderAction(input);
      if (result.ok) {
        router.push(`/crm/orders/${result.data.id}`);
        router.refresh();
        return;
      }
      if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
        const fe: Record<string, string> = {};
        for (const d of result.error.details) fe[d.field] = d.message;
        setFieldErrors(fe);
      }
      setError(result.error.message);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={6}>
        <Card>
          <CardHeader>
            <CardTitle>Header</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={2}>
                <Label htmlFor="customerId">Customer</Label>
                <select
                  id="customerId"
                  name="customerId"
                  required
                  defaultValue={preselectedCustomerId ?? ''}
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>
                    Choose a customer…
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <FieldError msg={fieldErrors.customerId} />
              </Stack>

              <Stack direction="row" gap={4}>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="channel">Channel</Label>
                  <select id="channel" name="channel" className={SELECT_CLASS} defaultValue="admin">
                    <option value="admin">Admin</option>
                    <option value="storefront">Storefront</option>
                    <option value="b2b_portal">B2B portal</option>
                    <option value="import">Import</option>
                    <option value="mcp">MCP</option>
                  </select>
                </Stack>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="source">Source</Label>
                  <Input id="source" name="source" placeholder="quote:Q-000123, ref:..." />
                </Stack>
                <Stack gap={2} className="w-32">
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    name="currency"
                    defaultValue="USD"
                    maxLength={3}
                    className="uppercase"
                  />
                </Stack>
                <Stack gap={2} className="w-32">
                  <Label htmlFor="shippingTotal">Shipping</Label>
                  <Input
                    id="shippingTotal"
                    name="shippingTotal"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={0}
                  />
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <LineItemsEditor onChange={setItems} initialItems={items} />
            <FieldError msg={fieldErrors.items} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={2}>
                <Label htmlFor="customerNote">Customer-facing note</Label>
                <Textarea id="customerNote" name="customerNote" rows={3} />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="internalNote">Internal note</Label>
                <Textarea id="internalNote" name="internalNote" rows={3} />
              </Stack>
            </Stack>
          </CardContent>
          <CardFooter>
            <Button variant="ghost" asChild>
              <Link href="/crm/orders">Cancel</Link>
            </Button>
            <Button type="submit" variant="module" disabled={pending} loading={pending}>
              Create order
            </Button>
          </CardFooter>
        </Card>

        {error && (
          <Text size="sm" variant="danger" role="alert" aria-live="polite">
            {error}
          </Text>
        )}
      </Stack>
    </form>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numOrZero(value: FormDataEntryValue | null): number {
  const s = typeof value === 'string' ? value.trim() : '';
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null;
  return (
    <Text size="xs" variant="danger">
      {msg}
    </Text>
  );
}
