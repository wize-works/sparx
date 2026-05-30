import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package, CreditCard, Truck } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

import { api, type ApiRestError } from '@/lib/api-rest-client';

interface OrderItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  quantityFulfilled: number;
  quantityRefunded: number;
  unitPrice: string | number;
  lineTotal: string | number;
}

interface OrderWithItems {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customerId: string;
  currency: string;
  total: string | number;
  amountPaid: string | number;
  refundTotal: string | number;
  placedAt: string | null;
  items: OrderItem[];
}

interface PaymentRow {
  id: string;
  processor: string;
  status: string;
  amount: string | number;
  currency: string;
  capturedAt: string | null;
}

interface RefundRow {
  id: string;
  amount: string | number;
  currency: string;
  reason: string | null;
  refundedAt: string | null;
}

interface FulfillmentRow {
  id: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
}

interface CustomerSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  placed: 'outline',
  fulfilled: 'success',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'warning',
};

interface Props {
  id: string;
}

export async function OrderDetailContent({ id }: Props) {
  let order: OrderWithItems;
  try {
    order = await api.get<OrderWithItems>(`/v1/crm/orders/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const [payments, refunds, fulfillments, customer] = await Promise.all([
    api.get<PaymentRow[]>(`/v1/crm/orders/${order.id}/payments`),
    api.get<RefundRow[]>(`/v1/crm/orders/${order.id}/refunds`),
    api.get<FulfillmentRow[]>(`/v1/crm/orders/${order.id}/fulfillments`),
    api.get<CustomerSummary>(`/v1/crm/customers/${order.customerId}`).catch(() => null),
  ]);

  return (
    <Stack gap={6}>
      <Stack gap={2}>
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
                (customer.company ?? customer.email)}
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
            <Stat
              label="Placed"
              value={order.placedAt ? new Date(order.placedAt).toLocaleDateString() : '—'}
            />
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
                  <TableCell className="text-right tabular-nums">{item.quantityRefunded}</TableCell>
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
                          {p.capturedAt ? new Date(p.capturedAt).toLocaleDateString() : '—'}
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
                      {r.refundedAt ? new Date(r.refundedAt).toLocaleDateString() : '—'} ·{' '}
                      {r.reason ?? 'no reason'}
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
                        {f.shippedAt ? new Date(f.shippedAt).toLocaleDateString() : '—'}
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
  );
}
