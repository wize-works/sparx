import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Warehouse as WarehouseIcon } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { WarehouseEditForm } from './_components/warehouse-edit-form';
import { WarehouseArchiveButton } from './_components/warehouse-archive-button';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

export interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  type: string;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  defaultForChannel: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface InventoryLevelRow {
  variantId: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
  unitCostCents: number | null;
  updatedAt: string;
}

interface LevelsForWarehouseResponse {
  items: InventoryLevelRow[];
  total: number;
}

export async function WarehouseDetailContent({ id }: Props) {
  let warehouse: WarehouseRow;
  try {
    warehouse = await api.get<WarehouseRow>(`/v1/commerce/warehouses/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const { items: levels, total: levelCount } = await api.get<LevelsForWarehouseResponse>(
    `/v1/commerce/inventory/levels/warehouse/${id}?take=500`
  );
  const onHandTotal = levels.reduce((acc, l) => acc + l.onHand, 0);
  const lowCount = levels.filter(
    (l) => l.reorderPoint !== null && l.available <= l.reorderPoint
  ).length;

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={4}>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={3} wrap>
            <WarehouseIcon className="h-5 w-5" />
            <Heading level={1}>{warehouse.name}</Heading>
            <Badge variant="outline" className="font-mono text-xs">
              {warehouse.code}
            </Badge>
            <Badge variant="outline">{warehouse.type}</Badge>
            {warehouse.isActive ? (
              <Badge color="success">active</Badge>
            ) : (
              <Badge color="warning">inactive</Badge>
            )}
          </Stack>
          <Text size="sm" variant="muted">
            {[warehouse.city, warehouse.region, warehouse.country].filter(Boolean).join(', ')}
          </Text>
        </Stack>
        <WarehouseArchiveButton warehouseId={warehouse.id} isActive={warehouse.isActive} />
      </Stack>

      <Stack direction="row" gap={4} wrap>
        <Stat label="Tracked variants" value={levelCount.toString()} />
        <Stat label="Total on hand" value={onHandTotal.toString()} />
        <Stat
          label="Below reorder point"
          value={lowCount.toString()}
          tone={lowCount > 0 ? 'warn' : 'ok'}
        />
      </Stack>

      <WarehouseEditForm warehouse={warehouse} />

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Stock</Heading>
            <CardDescription>
              Full per-variant levels live on the{' '}
              <Link
                href={`/commerce/inventory?warehouse=${warehouse.id}`}
                className="underline hover:text-[var(--module-active)]"
              >
                inventory page
              </Link>{' '}
              — filter by this warehouse from there.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/commerce/inventory?warehouse=${warehouse.id}`}>Manage stock</Link>
          </Button>
        </CardContent>
      </Card>
    </Stack>
  );
}

function Stat({
  label,
  value,
  tone = 'ok',
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <Card className="min-w-[10rem] flex-1">
      <CardContent>
        <Stack gap={1} className="py-2">
          <Text size="xs" variant="muted">
            {label}
          </Text>
          <Text size="lg" className={tone === 'warn' ? 'text-[var(--color-warning)]' : undefined}>
            {value}
          </Text>
        </Stack>
      </CardContent>
    </Card>
  );
}
