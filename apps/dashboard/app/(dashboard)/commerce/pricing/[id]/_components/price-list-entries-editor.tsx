'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  EmptyState,
  Input,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { deletePriceListEntryAction, setPriceListEntryAction } from '../../../pricing-actions';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export interface VariantSummary {
  id: string;
  sku: string;
  title: string | null;
  basePriceCents: number;
  productTitle: string;
}

export interface EntryRow {
  id: string;
  variantId: string;
  variantSku: string;
  productTitle: string;
  fixedPriceCents: number | null;
  percentOffList: number | null;
  minQuantity: number;
  maxQuantity: number | null;
}

export function PriceListEntriesEditor({
  priceListId,
  entries,
  variants,
}: {
  priceListId: string;
  entries: EntryRow[];
  variants: VariantSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'fixed' | 'percent'>('fixed');

  function onAddEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const variantId = stringOr(form.get('variantId'), '');
    if (!variantId) {
      setError('Pick a variant');
      return;
    }
    const minQuantity = Number(stringOr(form.get('minQuantity'), '1')) || 1;
    const maxRaw = stringOr(form.get('maxQuantity'), '');
    const maxQuantity = maxRaw ? Number(maxRaw) : undefined;

    let fixedPriceCents: number | undefined;
    let percentOffList: number | undefined;
    if (mode === 'fixed') {
      const dollars = Number(stringOr(form.get('fixedPrice'), '0'));
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setError('Fixed price must be positive');
        return;
      }
      fixedPriceCents = Math.round(dollars * 100);
    } else {
      const percent = Number(stringOr(form.get('percentOff'), '0'));
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        setError('Percent off must be 1-100');
        return;
      }
      percentOffList = percent;
    }

    startTransition(async () => {
      const result = await setPriceListEntryAction({
        priceListId,
        variantId,
        minQuantity,
        maxQuantity,
        fixedPriceCents: fixedPriceCents ?? null,
        percentOffList: percentOffList ?? null,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  function onDelete(entryId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deletePriceListEntryAction(entryId, priceListId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={4}>
      <form onSubmit={onAddEntry}>
        <Stack
          direction="row"
          gap={3}
          align="end"
          wrap
          className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3"
        >
          <Stack gap={1} className="min-w-[16rem] flex-1">
            <Text size="xs" variant="muted">
              Variant
            </Text>
            <select
              name="variantId"
              defaultValue=""
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              <option value="">— pick —</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.productTitle} · {v.sku}
                  {v.title ? ` (${v.title})` : ''} — base {moneyFmt.format(v.basePriceCents / 100)}
                </option>
              ))}
            </select>
          </Stack>
          <Stack gap={1}>
            <Text size="xs" variant="muted">
              Mode
            </Text>
            <Stack direction="row" gap={2}>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="mode"
                  value="fixed"
                  checked={mode === 'fixed'}
                  onChange={() => setMode('fixed')}
                />
                <Text size="sm">Fixed</Text>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="mode"
                  value="percent"
                  checked={mode === 'percent'}
                  onChange={() => setMode('percent')}
                />
                <Text size="sm">Percent off</Text>
              </label>
            </Stack>
          </Stack>
          {mode === 'fixed' ? (
            <Stack gap={1} className="w-[8rem]">
              <Text size="xs" variant="muted">
                Fixed ($)
              </Text>
              <Input name="fixedPrice" defaultValue="" placeholder="0.00" />
            </Stack>
          ) : (
            <Stack gap={1} className="w-[8rem]">
              <Text size="xs" variant="muted">
                Percent off
              </Text>
              <Input name="percentOff" defaultValue="" placeholder="10" />
            </Stack>
          )}
          <Stack gap={1} className="w-[6rem]">
            <Text size="xs" variant="muted">
              Min qty
            </Text>
            <Input name="minQuantity" defaultValue="1" />
          </Stack>
          <Stack gap={1} className="w-[6rem]">
            <Text size="xs" variant="muted">
              Max qty
            </Text>
            <Input name="maxQuantity" defaultValue="" placeholder="any" />
          </Stack>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Add'}
          </Button>
        </Stack>
        {error && (
          <Text size="xs" className="mt-2 text-[var(--color-danger)]">
            {error}
          </Text>
        )}
      </form>

      {entries.length === 0 ? (
        <EmptyState
          icon={<Text className="text-2xl">$</Text>}
          title="No entries yet"
          description="Add a per-variant override above. Variants without an entry fall back to the locked resolution chain."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Override</TableHead>
              <TableHead>Quantity range</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <span className="font-mono text-xs">{entry.variantSku}</span>
                </TableCell>
                <TableCell>{entry.productTitle}</TableCell>
                <TableCell>
                  {entry.fixedPriceCents !== null ? (
                    <Badge variant="outline">
                      {moneyFmt.format(entry.fixedPriceCents / 100)} fixed
                    </Badge>
                  ) : (
                    <Badge variant="outline">{entry.percentOffList}% off</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {entry.minQuantity}
                  {entry.maxQuantity !== null ? `–${entry.maxQuantity}` : '+'}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(entry.id)}
                    disabled={pending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Stack>
  );
}

function stringOr(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}
