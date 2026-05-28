import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { CrmNotFoundError, customerService, quoteService } from '@sparx/crm';
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

import { QuoteLifecycleActions } from './_components/quote-lifecycle-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  draft: 'outline',
  submitted: 'outline',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
  converted: 'success',
};

export default async function QuoteDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let quote;
  try {
    quote = await quoteService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  const customer = quote.customerId
    ? await customerService.get(ctx, quote.customerId).catch(() => null)
    : null;

  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Stack gap={2}>
          <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            <Link href="/crm/quotes">All quotes</Link>
          </Button>
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
                    customer.company ||
                    customer.email}
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
              <Stat label="Valid until" value={quote.validUntil?.toLocaleDateString() ?? '—'} />
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

        {(quote.customerNote || quote.internalNote) && (
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
    </Container>
  );
}
