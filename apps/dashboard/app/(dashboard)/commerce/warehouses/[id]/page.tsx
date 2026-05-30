import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, PackageOpen, Warehouse as WarehouseIcon } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { CommerceNotFoundError, inventoryService } from '@sparx/commerce';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { ModuleStub } from '../../../../../components/module-stub';

import { WarehouseEditForm } from './_components/warehouse-edit-form';
import { WarehouseArchiveButton } from './_components/warehouse-archive-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WarehouseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Commerce is disabled. Activate it from Billing to manage warehouses."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let warehouse;
  try {
    warehouse = await inventoryService.getWarehouse(ctx, id);
  } catch (err) {
    if (err instanceof CommerceNotFoundError) notFound();
    throw err;
  }

  // Sneak a small stat strip — how many distinct variants have stock here
  // and how many are below their reorder point. Both come from a single
  // page of the levels query so the cost stays under one round-trip.
  const { items: levels, total: levelCount } = await inventoryService.levelsForWarehouse(ctx, id, {
    take: 500,
  });
  const onHandTotal = levels.reduce((acc, l) => acc + l.onHand, 0);
  const lowCount = levels.filter(
    (l) => l.reorderPoint !== null && l.available <= l.reorderPoint
  ).length;

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Link
            href="/commerce/warehouses"
            className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to warehouses
          </Link>
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
                  <Badge variant="success">active</Badge>
                ) : (
                  <Badge variant="warning">inactive</Badge>
                )}
              </Stack>
              <Text size="sm" variant="muted">
                {[warehouse.city, warehouse.region, warehouse.country].filter(Boolean).join(', ')}
              </Text>
            </Stack>
            <WarehouseArchiveButton warehouseId={warehouse.id} isActive={warehouse.isActive} />
          </Stack>
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
                Full per-variant levels live on the {' '}
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
            <Button asChild variant="secondary">
              <Link href={`/commerce/inventory?warehouse=${warehouse.id}`}>Manage stock</Link>
            </Button>
          </CardContent>
        </Card>
      </Stack>
    </Container>
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
