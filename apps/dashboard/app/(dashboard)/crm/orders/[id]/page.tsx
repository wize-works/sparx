import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package, CreditCard, Truck } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import {
  CrmNotFoundError,
  customerService,
  orderFulfillmentsService,
  orderPaymentsService,
  orderRefundsService,
  orderService,
} from '@sparx/crm';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  Heading,
  Stack,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  placed: 'outline',
  fulfilled: 'success',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'warning',
};

export default async function OrderDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let order;
  try {
    order = await orderService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  const [payments, refunds, fulfillments, customer] = await Promise.all([
    orderPaymentsService.listForOrder(ctx, order.id),
    orderRefundsService.listForOrder(ctx, order.id),
    orderFulfillmentsService.listForOrder(ctx, order.id),
    customerService.get(ctx, order.customerId).catch(() => null),
  ]);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Stack gap={2}>
          <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            <Link href="/crm/orders">All orders</Link>
          </Button>
          <Stack direction="row" align="center" gap={3} wrap>
            <Heading level={1}>{order.orderNumber}</Heading>
            <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'}>{order.status}</Badge>
            <Badge variant="outline">{order.paymentStatus}</Badge>
            {customer && (
              <Link
                href={`/crm/customers/${customer.id}`}
                className="text-sm hover:text-[var(--module-active)] hover:underline"
              >
                {[customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
                  customer.company ||
                  customer.email}
              </Link>
            )}
          </Stack>
        </Stack>

        <div className="grid gap-4 md:grid-cols-4">
          <Card variant="module">
            <CardContent className="py-4">
              <Stat
                label="Total"
                value={`${order.currency} ${Number(order.total).toLocaleString()}`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat
                label="Paid"
                value={`${order.currency} ${Number(order.amountPaid).toLocaleString()}`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat
                label="Refunded"
                value={`${order.currency} ${Number(order.refundTotal).toLocaleString()}`}
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="Placed" value={order.placedAt?.toLocaleDateString() ?? '—'} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <Stack direction="row" align="center" gap={2}>
                <Package className="h-4 w-4" /> Line items
                <Badge variant="outline">{order.items.length}</Badge>
              </Stack>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Fulfilled</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <code className="text-xs">{item.sku}</code>
                    </TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantityFulfilled}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.quantityRefunded}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.currency} {Number(item.unitPrice).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.currency} {Number(item.lineTotal).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" align="center" gap={2}>
                  <CreditCard className="h-4 w-4" /> Payments
                  <Badge variant="outline">{payments.length}</Badge>
                </Stack>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <Text size="sm" variant="muted">
                  No payments recorded.
                </Text>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Processor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Captured</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Text size="sm">{p.processor}</Text>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.currency} {Number(p.amount).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Text size="xs" variant="muted">
                            {p.capturedAt?.toLocaleDateString() ?? '—'}
                          </Text>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {refunds.length > 0 && (
                <Stack gap={2} className="mt-4">
                  <Text size="sm" weight="medium">
                    Refunds
                  </Text>
                  {refunds.map((r) => (
                    <Stack key={r.id} direction="row" justify="between">
                      <Text size="xs" variant="muted">
                        {r.refundedAt?.toLocaleDateString() ?? '—'} · {r.reason ?? 'no reason'}
                      </Text>
                      <Text size="xs" className="tabular-nums">
                        {r.currency} {Number(r.amount).toLocaleString()}
                      </Text>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" align="center" gap={2}>
                  <Truck className="h-4 w-4" /> Fulfillments
                  <Badge variant="outline">{fulfillments.length}</Badge>
                </Stack>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fulfillments.length === 0 ? (
                <Text size="sm" variant="muted">
                  No fulfillments yet.
                </Text>
              ) : (
                <Stack gap={3}>
                  {fulfillments.map((f) => (
                    <Stack key={f.id} gap={1}>
                      <Stack direction="row" justify="between">
                        <Stack direction="row" align="center" gap={2}>
                          <Badge variant="outline" className="text-xs">
                            {f.status}
                          </Badge>
                          {f.carrier && (
                            <Text size="sm" variant="muted">
                              {f.carrier}
                            </Text>
                          )}
                          {f.trackingNumber && <code className="text-xs">{f.trackingNumber}</code>}
                        </Stack>
                        <Text size="xs" variant="muted">
                          {f.shippedAt?.toLocaleDateString() ?? '—'}
                        </Text>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </div>
      </Stack>
    </Container>
  );
}
