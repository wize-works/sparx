import Link from 'next/link';
import { Warehouse as WarehouseIcon, Plus } from 'lucide-react';

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
  PageHeader,
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

import { EntityRowLink } from '../../_components/entity-row-link';

// Warehouses — the per-tenant physical/virtual stock locations the
// inventory picker selects between. Phase 2: list + create + archive.
// Per-warehouse inventory editing lives on the inventory page.

export const dynamic = 'force-dynamic';

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

export default async function WarehousesPage() {
  const warehouses = await api.get<WarehouseRow[]>('/v1/commerce/warehouses?include_archived=true');

  const active = warehouses.filter((w) => w.isActive);
  const inactive = warehouses.filter((w) => !w.isActive);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<WarehouseIcon className="h-5 w-5" />}
          title="Warehouses"
          badge={
            <Badge color="module">
              {active.length} active{inactive.length ? ` · ${inactive.length} inactive` : ''}
            </Badge>
          }
          description="Inventory levels, lot batches, and serial units all sit beneath a warehouse. A tenant needs at least one active warehouse before stock can be reserved or sold. Dropship suppliers register as a virtual warehouse so the inventory model stays uniform."
          actions={
            <Button asChild>
              <Link href="/commerce/warehouses/new">
                <Plus className="h-4 w-4" />
                Add warehouse
              </Link>
            </Button>
          }
        />

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
                          <Badge color="success">active</Badge>
                        ) : (
                          <Badge color="warning">inactive</Badge>
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
