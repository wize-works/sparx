import Link from 'next/link';
import { Boxes } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { inventoryService } from '@sparx/commerce';
import { withTenant } from '@sparx/db';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';

import { InventoryRowEditor } from './_components/inventory-row-editor';

// Inventory — by-warehouse stock view. Lets staff:
//   • Filter to one warehouse
//   • See on-hand / allocated / available per variant
//   • Inline-adjust on-hand with a reason
//   • See which rows are below the reorder point
//
// Lot/serial + transfer flows live on dedicated pages.

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

interface WarehouseRow {
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

interface LowStockRow {
  variantId: string;
  productId: string;
  sku: string;
  title: string;
  warehouseId: string;
  warehouseCode: string;
  available: number;
  reorderPoint: number;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
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

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const params = (await searchParams) ?? {};
  const warehouseFilter = pickString(params.warehouse);
  const lowStockOnly = pickString(params.low) === '1';

  const lowStockQuery = new URLSearchParams({ take: '50' });
  if (warehouseFilter) lowStockQuery.set('warehouse_id', warehouseFilter);

  const [warehouses, lowStock] = await Promise.all([
    api.get<WarehouseRow[]>('/v1/commerce/warehouses'),
    api.get<LowStockRow[]>(`/v1/commerce/inventory/low-stock?${lowStockQuery.toString()}`),
  ]);

  const activeWarehouse = warehouseFilter ? warehouses.find((w) => w.id === warehouseFilter) : null;
  const fallbackWarehouse = activeWarehouse ?? warehouses[0] ?? null;

  // The full per-warehouse level grid. Inline-editable.
  const grid = fallbackWarehouse
    ? await loadLevelsWithVariant(ctx, fallbackWarehouse.id, { lowStockOnly })
    : { items: [], total: 0 };

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <Boxes className="h-5 w-5" />
              <Heading level={1}>Inventory</Heading>
              {fallbackWarehouse && <Badge variant="module">{fallbackWarehouse.code}</Badge>}
            </Stack>
            <Text variant="muted">
              On-hand is the authoritative count; allocated is the active reservation total across
              carts, orders, and subscriptions; available = on-hand − allocated.
            </Text>
          </Stack>
          <Stack direction="row" gap={2}>
            <Button asChild variant="secondary">
              <Link href="/commerce/warehouses">Manage warehouses</Link>
            </Button>
          </Stack>
        </Stack>

        {warehouses.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No warehouses yet"
            description="Create a warehouse before tracking inventory."
            action={
              <Button asChild>
                <Link href="/commerce/warehouses/new">Add warehouse</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <Stack gap={1}>
                  <Heading level={3}>Filters</Heading>
                  <CardDescription>
                    Per-tenant. URL parameters are linkable for triage handoffs.
                  </CardDescription>
                </Stack>
              </CardHeader>
              <CardContent>
                <form method="GET" action="/commerce/inventory">
                  <Stack direction="row" gap={3} wrap align="end">
                    <Stack gap={1}>
                      <Text size="xs" variant="muted">
                        Warehouse
                      </Text>
                      <select
                        name="warehouse"
                        defaultValue={fallbackWarehouse?.id ?? ''}
                        className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} — {w.name}
                          </option>
                        ))}
                      </select>
                    </Stack>
                    <label className="flex items-center gap-2 pb-1.5">
                      <input type="checkbox" name="low" value="1" defaultChecked={lowStockOnly} />
                      <Text size="sm">Low stock only</Text>
                    </label>
                    <Button type="submit" variant="secondary">
                      Apply
                    </Button>
                  </Stack>
                </form>
              </CardContent>
            </Card>

            {lowStock.length > 0 && (
              <Card>
                <CardHeader>
                  <Stack gap={1}>
                    <Heading level={3}>Reorder watch</Heading>
                    <CardDescription>
                      Variants at or below their reorder point. Filtered to{' '}
                      {warehouseFilter ? 'the selected warehouse' : 'every warehouse'}.
                    </CardDescription>
                  </Stack>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Reorder at</TableHead>
                        <TableHead>Suggested order</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStock.map((row) => (
                        <TableRow key={`${row.variantId}:${row.warehouseId}`}>
                          <TableCell>
                            <span className="font-mono text-xs">{row.sku}</span>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/commerce/products/${row.productId}`}
                              className="hover:text-[var(--module-active)]"
                            >
                              {row.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{row.warehouseCode}</Badge>
                          </TableCell>
                          <TableCell>
                            <Text className="text-[var(--color-warning)]">{row.available}</Text>
                          </TableCell>
                          <TableCell>{row.reorderPoint}</TableCell>
                          <TableCell>{row.reorderQuantity ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <Stack gap={1}>
                  <Heading level={3}>
                    Stock at {fallbackWarehouse?.code ?? '—'}
                    <Badge variant="outline" className="ml-2 text-xs">
                      {grid.total} variants
                    </Badge>
                  </Heading>
                  <CardDescription>
                    Each row shows the latest counts; the inline editor records every change as an
                    audited adjustment (sale, recount, manual…).
                  </CardDescription>
                </Stack>
              </CardHeader>
              <CardContent>
                {grid.items.length === 0 ? (
                  <EmptyState
                    icon={<Boxes className="h-5 w-5" />}
                    title="No stock tracked at this warehouse"
                    description="As soon as a variant is reserved, sold, or manually adjusted at this warehouse, a row appears here."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead>Reorder</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grid.items.map((row) => (
                        <InventoryRowEditor
                          key={`${row.variantId}:${row.warehouseId}`}
                          row={row}
                          warehouseId={fallbackWarehouse!.id}
                        />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Stack>
    </Container>
  );
}

// Inventory-page grid: join the level rows to enough variant + product
// data that the table is readable without an extra round trip per row.
async function loadLevelsWithVariant(
  ctx: { tenantId: string; userId: string },
  warehouseId: string,
  filter: { lowStockOnly?: boolean }
) {
  const result = await inventoryService.levelsForWarehouse(ctx, warehouseId, {
    lowStockOnly: filter.lowStockOnly,
    take: 200,
  });
  const variantIds = result.items.map((l) => l.variantId);
  if (variantIds.length === 0) return { items: [], total: 0 };

  const variants = await withTenant(ctx, (tx) =>
    tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        sku: true,
        title: true,
        product: { select: { id: true, title: true } },
      },
    })
  );
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const items = result.items
    .map((level) => {
      const v = variantById.get(level.variantId);
      if (!v) return null;
      return {
        ...level,
        sku: v.sku,
        variantTitle: v.title,
        productId: v.product.id,
        productTitle: v.product.title,
      };
    })
    .filter(<T,>(x: T | null): x is T => x !== null);

  return { items, total: result.total };
}
