import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';

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

import { QuoteLifecycleActions } from './_components/quote-lifecycle-actions';

interface QuoteItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: string | number;
  discountAmount: string | number;
  taxAmount: string | number;
  lineTotal: string | number;
}

interface QuoteWithItems {
  id: string;
  quoteNumber: string;
  status: string;
  customerId: string | null;
  convertedToOrderId: string | null;
  currency: string;
  total: string | number;
  subtotal: string | number;
  taxTotal: string | number;
  validUntil: string | null;
  customerNote: string | null;
  internalNote: string | null;
  items: QuoteItem[];
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
  draft: 'outline',
  submitted: 'outline',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
  converted: 'success',
};

interface Props {
  id: string;
}

export async function QuoteDetailContent({ id }: Props) {
  let quote: QuoteWithItems;
  try {
    quote = await api.get<QuoteWithItems>(`/v1/crm/quotes/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const customer = quote.customerId
    ? await api.get<CustomerSummary>(`/v1/crm/customers/${quote.customerId}`).catch(() => null)
    : null;

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Stack direction="row" align="center" justify="between" wrap gap={3}>
          <Stack direction="row" align="center" gap={3} wrap>
            <Heading level={1}>{quote.quoteNumber}</Heading>
            <Badge variant={STATUS_VARIANT[quote.status] ?? 'outline'}>{quote.status}</Badge>
            {customer && (
              <Link
                href={`/crm/customers/${customer.id}`}
                className="text-sm hover:text-[var(--module-active)] hover:underline"
              >
                {[customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
                  (customer.company ?? customer.email)}
              </Link>
            )}
            {quote.convertedToOrderId && (
              <Link
                href={`/crm/orders/${quote.convertedToOrderId}`}
                className="text-sm hover:text-[var(--module-active)] hover:underline"
              >
                → Converted order
              </Link>
            )}
          </Stack>
          <QuoteLifecycleActions quoteId={quote.id} status={quote.status} />
        </Stack>
      </Stack>

      <div className="grid gap-4 md:grid-cols-4">
        <Card variant="module">
          <CardContent className="py-4">
            <Stat
              label="Total"
              value={`${quote.currency} ${Number(quote.total).toLocaleString()}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <Stat
              label="Subtotal"
              value={`${quote.currency} ${Number(quote.subtotal).toLocaleString()}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <Stat
              label="Tax"
              value={`${quote.currency} ${Number(quote.taxTotal).toLocaleString()}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <Stat
              label="Valid until"
              value={quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : '—'}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Stack direction="row" align="center" gap={2}>
              <Package className="h-4 w-4" /> Line items
              <Badge variant="outline">{quote.items.length}</Badge>
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
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quote.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <code className="text-xs">{item.sku}</code>
                  </TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quote.currency} {Number(item.unitPrice).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quote.currency} {Number(item.discountAmount).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quote.currency} {Number(item.taxAmount).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quote.currency} {Number(item.lineTotal).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(quote.customerNote ?? quote.internalNote) && (
        <div className="grid gap-4 md:grid-cols-2">
          {quote.customerNote && (
            <Card>
              <CardHeader>
                <CardTitle>Customer note</CardTitle>
              </CardHeader>
              <CardContent>
                <Text size="sm">{quote.customerNote}</Text>
              </CardContent>
            </Card>
          )}
          {quote.internalNote && (
            <Card>
              <CardHeader>
                <CardTitle>Internal note</CardTitle>
              </CardHeader>
              <CardContent>
                <Text size="sm">{quote.internalNote}</Text>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </Stack>
  );
}
