'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge, Button, Input, Stack, TableCell, TableRow, Text } from '@sparx/ui';

import { adjustInventoryAction, setReorderPolicyAction } from '../../inventory-actions';

const REASONS = [
  'recount',
  'receive',
  'loss',
  'damage',
  'manual',
  'transfer_in',
  'transfer_out',
] as const;

export interface InventoryRow {
  variantId: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
  sku: string;
  variantTitle: string | null;
  productId: string;
  productTitle: string;
}

export function InventoryRowEditor({
  row,
  warehouseId,
}: {
  row: InventoryRow;
  warehouseId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'view' | 'adjust' | 'reorder'>('view');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const belowReorder = row.reorderPoint !== null && row.available <= row.reorderPoint;

  function onAdjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const deltaStr = stringOr(form.get('delta'), '');
    const delta = Number(deltaStr);
    if (!Number.isFinite(delta) || delta === 0) {
      setError('Delta must be a non-zero number');
      return;
    }
    const reason = stringOr(form.get('reason'), 'manual');
    const note = stringOr(form.get('note'), '');
    startTransition(async () => {
      const result = await adjustInventoryAction({
        variantId: row.variantId,
        warehouseId,
        delta,
        reason,
        ...(note ? { note } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMode('view');
      router.refresh();
    });
  }

  function onSetReorder(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const reorderPoint = Number(stringOr(form.get('reorderPoint'), '0'));
    const reorderQuantity = Number(stringOr(form.get('reorderQuantity'), '0'));
    const leadTimeDaysStr = stringOr(form.get('leadTimeDays'), '');
    if (!Number.isFinite(reorderPoint) || reorderPoint < 0) {
      setError('Reorder point must be 0 or higher');
      return;
    }
    if (!Number.isFinite(reorderQuantity) || reorderQuantity <= 0) {
      setError('Reorder quantity must be positive');
      return;
    }
    const input: Record<string, unknown> = {
      variantId: row.variantId,
      warehouseId,
      reorderPoint,
      reorderQuantity,
    };
    if (leadTimeDaysStr) {
      const days = Number(leadTimeDaysStr);
      if (Number.isFinite(days) && days >= 0) input.leadTimeDays = days;
    }
    startTransition(async () => {
      const result = await setReorderPolicyAction(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setMode('view');
      router.refresh();
    });
  }

  return (
    <>
      <TableRow>
        <TableCell>
          <span className="font-mono text-xs">{row.sku}</span>
        </TableCell>
        <TableCell>
          <Stack gap={0}>
            <Link
              href={`/commerce/products/${row.productId}`}
              className="text-sm hover:text-[var(--module-active)]"
            >
              {row.productTitle}
            </Link>
            {row.variantTitle && (
              <Text size="xs" variant="muted">
                {row.variantTitle}
              </Text>
            )}
          </Stack>
        </TableCell>
        <TableCell className="text-right">{row.onHand}</TableCell>
        <TableCell className="text-right">{row.allocated}</TableCell>
        <TableCell className="text-right">
          <Text className={belowReorder ? 'text-[var(--color-warning)]' : undefined}>
            {row.available}
          </Text>
        </TableCell>
        <TableCell>
          {row.reorderPoint !== null ? (
            <Badge variant={belowReorder ? 'warning' : 'outline'} className="text-xs">
              ≤ {row.reorderPoint}
            </Badge>
          ) : (
            <Text size="xs" variant="muted">
              none
            </Text>
          )}
        </TableCell>
        <TableCell>
          <Stack direction="row" gap={1}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === 'adjust' ? 'view' : 'adjust')}
            >
              Adjust
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMode(mode === 'reorder' ? 'view' : 'reorder')}
            >
              Reorder
            </Button>
          </Stack>
        </TableCell>
      </TableRow>
      {mode === 'adjust' && (
        <TableRow>
          <TableCell colSpan={7} className="bg-[var(--color-bg-subtle)]">
            <form onSubmit={onAdjust}>
              <Stack direction="row" gap={3} align="end" wrap>
                <Stack gap={1}>
                  <Text size="xs" variant="muted">
                    Delta (±)
                  </Text>
                  <Input name="delta" defaultValue="0" className="w-[6rem]" />
                </Stack>
                <Stack gap={1}>
                  <Text size="xs" variant="muted">
                    Reason
                  </Text>
                  <select
                    name="reason"
                    defaultValue="manual"
                    className="border-[var(--color-border-default)] bg-[var(--color-bg-surface)] h-9 rounded border px-3 text-sm"
                  >
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Stack>
                <Stack gap={1} className="min-w-[14rem] flex-1">
                  <Text size="xs" variant="muted">
                    Note (optional)
                  </Text>
                  <Input name="note" placeholder="e.g. damaged in transit, recount after audit" />
                </Stack>
                <Stack direction="row" gap={2}>
                  <Button variant="ghost" size="sm" type="button" onClick={() => setMode('view')}>
                    Cancel
                  </Button>
                  <Button size="sm" type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Apply'}
                  </Button>
                </Stack>
              </Stack>
              {error && (
                <Text size="xs" className="text-[var(--color-danger)] mt-2">
                  {error}
                </Text>
              )}
            </form>
          </TableCell>
        </TableRow>
      )}
      {mode === 'reorder' && (
        <TableRow>
          <TableCell colSpan={7} className="bg-[var(--color-bg-subtle)]">
            <form onSubmit={onSetReorder}>
              <Stack direction="row" gap={3} align="end" wrap>
                <Stack gap={1}>
                  <Text size="xs" variant="muted">
                    Reorder point
                  </Text>
                  <Input
                    name="reorderPoint"
                    defaultValue={row.reorderPoint?.toString() ?? '0'}
                    className="w-[6rem]"
                  />
                </Stack>
                <Stack gap={1}>
                  <Text size="xs" variant="muted">
                    Reorder qty
                  </Text>
                  <Input
                    name="reorderQuantity"
                    defaultValue={row.reorderQuantity?.toString() ?? ''}
                    className="w-[6rem]"
                  />
                </Stack>
                <Stack gap={1}>
                  <Text size="xs" variant="muted">
                    Lead time (days)
                  </Text>
                  <Input
                    name="leadTimeDays"
                    defaultValue={row.leadTimeDays?.toString() ?? ''}
                    className="w-[8rem]"
                  />
                </Stack>
                <Stack direction="row" gap={2}>
                  <Button variant="ghost" size="sm" type="button" onClick={() => setMode('view')}>
                    Cancel
                  </Button>
                  <Button size="sm" type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Save policy'}
                  </Button>
                </Stack>
              </Stack>
              {error && (
                <Text size="xs" className="text-[var(--color-danger)] mt-2">
                  {error}
                </Text>
              )}
            </form>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function stringOr(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}
