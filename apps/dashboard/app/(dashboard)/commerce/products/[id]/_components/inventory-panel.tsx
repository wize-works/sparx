'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';

import type { inventoryService } from '@sparx/commerce';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  EmptyState,
  Heading,
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

import { adjustInventoryAction, setReorderPolicyAction } from '../../../inventory-actions';

type LevelRow = Awaited<ReturnType<typeof inventoryService.levelsForVariant>>[number];

export interface VariantWithLevels {
  variantId: string;
  sku: string;
  variantTitle: string | null;
  levels: LevelRow[];
}

export interface InventoryPanelProps {
  productId: string;
  variantsWithLevels: VariantWithLevels[];
  warehouses: { id: string; code: string; name: string }[];
}

const REASONS = ['recount', 'receive', 'loss', 'damage', 'manual'] as const;

export function InventoryPanel({ variantsWithLevels, warehouses }: InventoryPanelProps) {
  if (warehouses.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No warehouses yet"
            description="Add a warehouse before tracking inventory."
            action={
              <Button asChild>
                <Link href="/commerce/warehouses/new">Add warehouse</Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }
  if (variantsWithLevels.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No variants yet"
            description="Add at least one variant on the Variants tab before stocking inventory."
          />
        </CardContent>
      </Card>
    );
  }
  return (
    <Stack gap={4}>
      {variantsWithLevels.map((v) => (
        <VariantInventoryCard key={v.variantId} variant={v} warehouses={warehouses} />
      ))}
    </Stack>
  );
}

function VariantInventoryCard({
  variant,
  warehouses,
}: {
  variant: VariantWithLevels;
  warehouses: { id: string; code: string; name: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <Stack direction="row" align="end" justify="between" wrap gap={2}>
          <Stack gap={1}>
            <Heading level={4}>
              <span className="font-mono text-sm">{variant.sku}</span>
              {variant.variantTitle && (
                <Text variant="muted" className="ml-2 inline">
                  {variant.variantTitle}
                </Text>
              )}
            </Heading>
            <CardDescription>
              On hand, allocated, and available per warehouse. Inline adjust + reorder edits
              record an audit-logged InventoryAdjustment.
            </CardDescription>
          </Stack>
        </Stack>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Warehouse</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead>Reorder</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {warehouses.map((w) => {
              const level = variant.levels.find((l) => l.warehouseId === w.id);
              return (
                <VariantInventoryRow
                  key={w.id}
                  variantId={variant.variantId}
                  warehouse={w}
                  level={level}
                />
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function VariantInventoryRow({
  variantId,
  warehouse,
  level,
}: {
  variantId: string;
  warehouse: { id: string; code: string; name: string };
  level: LevelRow | undefined;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'view' | 'adjust' | 'reorder'>('view');
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const onHand = level?.onHand ?? 0;
  const allocated = level?.allocated ?? 0;
  const available = level?.available ?? 0;
  const reorderPoint = level?.reorderPoint ?? null;
  const belowReorder = reorderPoint !== null && available <= reorderPoint;

  function onAdjust(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const delta = Number(stringOr(form.get('delta'), '0'));
    if (!Number.isFinite(delta) || delta === 0) {
      setError('Delta must be non-zero');
      return;
    }
    const reason = stringOr(form.get('reason'), 'manual');
    const note = stringOr(form.get('note'), '');
    startTransition(async () => {
      const result = await adjustInventoryAction({
        variantId,
        warehouseId: warehouse.id,
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
    if (!Number.isFinite(reorderPoint) || reorderPoint < 0) {
      setError('Reorder point must be 0 or higher');
      return;
    }
    if (!Number.isFinite(reorderQuantity) || reorderQuantity <= 0) {
      setError('Reorder quantity must be positive');
      return;
    }
    startTransition(async () => {
      const result = await setReorderPolicyAction({
        variantId,
        warehouseId: warehouse.id,
        reorderPoint,
        reorderQuantity,
      });
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
          <Stack gap={0}>
            <Badge variant="outline" className="font-mono text-xs">
              {warehouse.code}
            </Badge>
            <Text size="xs" variant="muted">
              {warehouse.name}
            </Text>
          </Stack>
        </TableCell>
        <TableCell className="text-right">{onHand}</TableCell>
        <TableCell className="text-right">{allocated}</TableCell>
        <TableCell className="text-right">
          <Text className={belowReorder ? 'text-[var(--color-warning)]' : undefined}>
            {available}
          </Text>
        </TableCell>
        <TableCell>
          {reorderPoint !== null ? (
            <Badge variant={belowReorder ? 'warning' : 'outline'} className="text-xs">
              ≤ {reorderPoint}
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
          <TableCell colSpan={6} className="bg-[var(--color-bg-subtle)]">
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
                    Note
                  </Text>
                  <Input name="note" placeholder="optional" />
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
          <TableCell colSpan={6} className="bg-[var(--color-bg-subtle)]">
            <form onSubmit={onSetReorder}>
              <Stack direction="row" gap={3} align="end" wrap>
                <Stack gap={1}>
                  <Text size="xs" variant="muted">
                    Reorder point
                  </Text>
                  <Input
                    name="reorderPoint"
                    defaultValue={reorderPoint?.toString() ?? '0'}
                    className="w-[6rem]"
                  />
                </Stack>
                <Stack gap={1}>
                  <Text size="xs" variant="muted">
                    Reorder qty
                  </Text>
                  <Input
                    name="reorderQuantity"
                    defaultValue={level?.reorderQuantity?.toString() ?? ''}
                    className="w-[6rem]"
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
