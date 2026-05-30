import Link from 'next/link';
import { Warehouse as WarehouseIcon, PackageOpen, Plus } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { inventoryService } from '@sparx/commerce';
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

import { ModuleStub } from '../../../../components/module-stub';

// Warehouses — the per-tenant physical/virtual stock locations the
// inventory picker selects between. Phase 2: list + create + archive.
// Per-warehouse inventory editing lives on the inventory page.

export const dynamic = 'force-dynamic';

export default async function WarehousesPage() {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Warehouses route orders to physical stock."
        description="Activate the Commerce module from Billing to manage warehouses."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const warehouses = await inventoryService.listWarehouses(ctx, { includeInactive: true });

  const active = warehouses.filter((w) => w.isActive);
  const inactive = warehouses.filter((w) => !w.isActive);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="end" justify="between" wrap gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              <WarehouseIcon className="h-5 w-5" />
              <Heading level={1}>Warehouses</Heading>
              <Badge variant="module">
                {active.length} active{inactive.length ? ` · ${inactive.length} inactive` : ''}
              </Badge>
            </Stack>
            <Text variant="muted">
              Inventory levels, lot batches, and serial units all sit beneath a warehouse. A tenant
              needs at least one active warehouse before stock can be reserved or sold. Dropship
              suppliers register as a virtual warehouse so the inventory model stays uniform.
            </Text>
          </Stack>
          <Button asChild>
            <Link href="/commerce/warehouses/new">
              <Plus className="h-4 w-4" />
              Add warehouse
            </Link>
          </Button>
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>All warehouses</Heading>
              <CardDescription>
                Click a row to manage its address, default channels, and reorder defaults.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {warehouses.length === 0 ? (
              <EmptyState
                icon={<WarehouseIcon className="h-5 w-5" />}
                title="No warehouses yet"
                description="Add your first warehouse to start tracking stock. A merchant with only digital goods can use a single virtual warehouse."
                action={
                  <Button asChild>
                    <Link href="/commerce/warehouses/new">Create warehouse</Link>
                  </Button>
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/warehouses/${w.id}`}
                          entityType="warehouse"
                          entityId={w.id}
                          className="font-mono text-xs hover:text-[var(--module-active)]"
                        >
                          {w.code}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>{w.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{w.type}</Badge>
                      </TableCell>
                      <TableCell>
                        {[w.city, w.region, w.country].filter(Boolean).join(', ') || '—'}
                      </TableCell>
                      <TableCell>
                        {w.defaultForChannel.length > 0 ? (
                          <Stack direction="row" gap={1} wrap>
                            {w.defaultForChannel.map((c) => (
                              <Badge key={c} variant="outline" className="text-xs">
                                {c}
                              </Badge>
                            ))}
                          </Stack>
                        ) : (
                          <Text size="xs" variant="muted">
                            none
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        {w.isActive ? (
                          <Badge variant="success">active</Badge>
                        ) : (
                          <Badge variant="warning">inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
