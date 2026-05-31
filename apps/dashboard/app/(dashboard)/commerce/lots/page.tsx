import Link from 'next/link';
import { CircleAlert, ShieldAlert } from 'lucide-react';

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

// Lot batches — beauty + food + supplements + regulated goods carry
// expiry + hazmat data per batch. Lists the next-to-expire and any
// active recalls. Per-variant lot management lives on the product
// detail page once Phase 2's PDP tab lands.

export const dynamic = 'force-dynamic';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface LotBatchRow {
  id: string;
  variantId: string;
  warehouseId: string;
  warehouseCode: string;
  lotNumber: string;
  manufacturedAt: string | null;
  expiresAt: string | null;
  quantity: number;
  hazmatClass: string;
  recallStatus: string | null;
  supplierBatchRef: string | null;
}

export default async function LotsPage() {
  const horizon = new Date(2027, 5, 1).toISOString();
  const [expiringSoon, activeRecalls] = await Promise.all([
    api.get<LotBatchRow[]>(
      `/v1/commerce/inventory/lots/expiring?before=${encodeURIComponent(horizon)}`
    ),
    api.get<ActiveRecall[]>('/v1/commerce/inventory/recalls/active'),
  ]);

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<CircleAlert className="h-5 w-5" />}
          title="Lot batches"
          badge={
            <>
              {expiringSoon.length > 0 && (
                <Badge color="warning">{expiringSoon.length} expiring within a year</Badge>
              )}
              {activeRecalls.length > 0 && (
                <Badge color="danger">{activeRecalls.length} active recall</Badge>
              )}
            </>
          }
          description="Hazmat-flagged batches inform shipping routing automatically. Recalled lots flip their unsold serials to scrapped and the dashboard surfaces affected customers so you can email them."
        />

        {activeRecalls.length > 0 && (
          <Card>
            <CardHeader>
              <Stack direction="row" align="center" gap={2}>
                <ShieldAlert className="h-5 w-5 text-[var(--color-danger)]" />
                <Heading level={3}>Active recalls</Heading>
              </Stack>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Recalled at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRecalls.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{r.lotNumber}</span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/commerce/products/${r.productId}`}
                          className="hover:text-[var(--module-active)]"
                        >
                          {r.productTitle}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.warehouseCode}</Badge>
                      </TableCell>
                      <TableCell>
                        <Text size="sm">{r.recallReason ?? '—'}</Text>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" variant="muted">
                          {r.recalledAt ? new Date(r.recalledAt).toLocaleDateString() : '—'}
                        </Text>
                      </TableCell>
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
              <Heading level={3}>Expiring within a year</Heading>
              <CardDescription>
                Sorted by closest expiry. Per-variant lot creation lives on the product detail
                page&apos;s Inventory tab.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {expiringSoon.length === 0 ? (
              <EmptyState
                icon={<CircleAlert className="h-5 w-5" />}
                title="No lots expiring soon"
                description="Lots with no expiry, or lots expiring after the next year, don't show up here. Create one from a product detail page."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Hazmat</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringSoon.map((l) => {
                    const days = l.expiresAt
                      ? Math.round(
                          (new Date(l.expiresAt).getTime() -
                            new Date(horizon).getTime() +
                            ONE_YEAR_MS) /
                            (24 * 60 * 60 * 1000)
                        )
                      : null;
                    return (
                      <TableRow key={l.id}>
                        <TableCell>
                          <span className="font-mono text-xs">{l.lotNumber}</span>
                        </TableCell>
                        <TableCell>{l.quantity}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{l.warehouseCode}</Badge>
                        </TableCell>
                        <TableCell>
                          {l.hazmatClass === 'none' ? (
                            <Text size="xs" variant="muted">
                              none
                            </Text>
                          ) : (
                            <Badge color="warning">{l.hazmatClass}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Text size="sm">
                            {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : '—'}
                          </Text>
                          {days !== null && (
                            <Text size="xs" variant="muted">
                              {days} days
                            </Text>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Stack direction="row" gap={2} justify="center">
          <Button asChild variant="ghost">
            <Link href="/commerce/products">Manage lots on a product</Link>
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}

interface ActiveRecall {
  id: string;
  lotNumber: string;
  recallReason: string | null;
  recalledAt: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  variantId: string;
  variantSku: string;
  productId: string;
  productTitle: string;
}
