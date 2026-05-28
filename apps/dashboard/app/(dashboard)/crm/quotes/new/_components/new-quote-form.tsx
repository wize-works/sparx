'use client';

// New-quote form. Anchors to either a customer, a B2B account, or both —
// validated server-side via QuoteAnchor.refine.

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

import { createQuoteAction } from '../../../quote-actions';
import { LineItemsEditor, type LineItem } from '../../../_components/line-items-editor';

interface NewQuoteFormProps {
  customers: { id: string; label: string }[];
  b2bAccounts: { id: string; label: string }[];
  preselectedCustomerId: string | null;
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export function NewQuoteForm({ customers, b2bAccounts, preselectedCustomerId }: NewQuoteFormProps) {
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
      customerId: nonEmpty(form.get('customerId')),
      b2bAccountId: nonEmpty(form.get('b2bAccountId')),
      currency: (nonEmpty(form.get('currency')) ?? 'USD').toUpperCase(),
      shippingTotal: numOrZero(form.get('shippingTotal')),
      paymentTerms: nonEmpty(form.get('paymentTerms')),
      validUntil: toIsoDateTime(form.get('validUntil')),
      customerNote: nonEmpty(form.get('customerNote')),
      internalNote: nonEmpty(form.get('internalNote')),
      items,
    };

    startTransition(async () => {
      const result = await createQuoteAction(input);
      if (result.ok) {
        router.push(`/crm/quotes/${result.data.id}`);
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
              <Stack direction="row" gap={4}>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="customerId">Customer</Label>
                  <select
                    id="customerId"
                    name="customerId"
                    defaultValue={preselectedCustomerId ?? ''}
                    className={SELECT_CLASS}
                  >
                    <option value="">(none)</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Stack>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="b2bAccountId">B2B account</Label>
                  <select
                    id="b2bAccountId"
                    name="b2bAccountId"
                    defaultValue=""
                    className={SELECT_CLASS}
                  >
                    <option value="">(none)</option>
                    {b2bAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </Stack>
              </Stack>
              <Text size="xs" variant="muted">
                At least one of customer or B2B account is required.
              </Text>

              <Stack direction="row" gap={4}>
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
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="paymentTerms">Payment terms</Label>
                  <select
                    id="paymentTerms"
                    name="paymentTerms"
                    defaultValue=""
                    className={SELECT_CLASS}
                  >
                    <option value="">(unspecified)</option>
                    <option value="prepay">Prepay</option>
                    <option value="net15">Net 15</option>
                    <option value="net30">Net 30</option>
                    <option value="net60">Net 60</option>
                    <option value="net90">Net 90</option>
                  </select>
                </Stack>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="validUntil">Valid until</Label>
                  <Input id="validUntil" name="validUntil" type="date" />
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
              <Link href="/crm/quotes">Cancel</Link>
            </Button>
            <Button type="submit" variant="module" disabled={pending} loading={pending}>
              Create quote
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

function toIsoDateTime(value: FormDataEntryValue | null): string | undefined {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return undefined;
  // <input type="date"> gives YYYY-MM-DD; the Zod schema wants ISO datetime.
  return new Date(`${s}T00:00:00Z`).toISOString();
}

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null;
  return (
    <Text size="xs" variant="danger">
      {msg}
    </Text>
  );
}
