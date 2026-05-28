import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText, Receipt, Calendar, User, Briefcase } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import {
  CrmNotFoundError,
  activityService,
  customerService,
  dealService,
  orderService,
  pipelineService,
  quoteService,
} from '@sparx/crm';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

import { stageColor } from '../../pipelines/[id]/_components/kanban-types';
import { AttachOrderPopover, DetachOrderButton } from './_components/attach-order-popover';
import { AttachQuotePopover, DetachQuoteButton } from './_components/attach-quote-popover';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DealDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let deal;
  try {
    deal = await dealService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  const [
    pipeline,
    attachedOrders,
    attachedQuotes,
    activities,
    customer,
    candidateOrders,
    candidateQuotes,
  ] = await Promise.all([
    pipelineService.get(ctx, deal.pipelineId),
    dealService.listAttachedOrders(ctx, deal.id),
    dealService.listAttachedQuotes(ctx, deal.id),
    activityService.list(ctx, { dealId: deal.id, take: 20 }),
    deal.customerId ? customerService.get(ctx, deal.customerId).catch(() => null) : null,
    // Pull a slice of recent orders + quotes (optionally filtered to this
    // deal's customer) to populate the attach popovers without an extra
    // round-trip on click.
    orderService.list(ctx, {
      take: 100,
      sortBy: 'placedAt',
      ...(deal.customerId ? { customerId: deal.customerId } : {}),
    }),
    quoteService.list(ctx, {
      take: 100,
      sortBy: 'createdAt',
      ...(deal.customerId ? { customerId: deal.customerId } : {}),
    }),
  ]);
  const stage = pipeline.stages.find((s) => s.id === deal.stageId);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Stack gap={2}>
          <Button asChild variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            <Link href={`/crm/pipelines/${deal.pipelineId}`}>Back to pipeline</Link>
          </Button>
          <Stack direction="row" align="center" gap={3} wrap>
            <Heading level={1}>{deal.title}</Heading>
            {stage && (
              <Badge
                variant="outline"
                style={{ borderColor: stageColor(stage), color: stageColor(stage) }}
              >
                {stage.name} · {Number(stage.probability)}%
              </Badge>
            )}
            {deal.closedAt && (
              <Badge variant={stage?.stageType === 'won' ? 'success' : 'warning'}>
                Closed {deal.closedAt.toLocaleDateString()}
              </Badge>
            )}
          </Stack>
          <Stack direction="row" gap={4} wrap>
            <Stack direction="row" align="center" gap={1}>
              <Briefcase className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
              <Text size="sm" variant="muted">
                {deal.currency} {Number(deal.value).toLocaleString()}
              </Text>
            </Stack>
            <Stack direction="row" align="center" gap={1}>
              <Calendar className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
              <Text size="sm" variant="muted">
                {deal.expectedCloseDate
                  ? `Expected ${deal.expectedCloseDate.toLocaleDateString()}`
                  : 'No expected close'}
              </Text>
            </Stack>
            {customer && (
              <Stack direction="row" align="center" gap={1}>
                <User className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                <Link
                  href={`/crm/customers/${customer.id}`}
                  className="text-sm hover:text-[var(--module-active)] hover:underline"
                >
                  {[customer.firstName, customer.lastName].filter(Boolean).join(' ') ||
                    (customer.company ?? customer.email)}
                </Link>
              </Stack>
            )}
          </Stack>
        </Stack>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <Stack gap={6}>
            <Card>
              <CardHeader>
                <Stack direction="row" align="center" justify="between">
                  <CardTitle>
                    <Stack direction="row" align="center" gap={2}>
                      <Receipt className="h-4 w-4" /> Attached orders
                      <Badge variant="outline">{attachedOrders.length}</Badge>
                    </Stack>
                  </CardTitle>
                  <AttachOrderPopover
                    dealId={deal.id}
                    attachedIds={attachedOrders.map((o) => o.id)}
                    candidates={candidateOrders.items.map((o) => ({
                      id: o.id,
                      orderNumber: o.orderNumber,
                      status: o.status,
                      total: o.total.toString(),
                      currency: o.currency,
                    }))}
                  />
                </Stack>
              </CardHeader>
              <CardContent>
                {attachedOrders.length === 0 ? (
                  <EmptyState
                    title="No attached orders"
                    description="Orders attached to this deal show up here. Use the Attach order button above."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Placed</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attachedOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <Link
                              href={`/crm/orders/${o.id}`}
                              className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                            >
                              {o.orderNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {o.currency} {Number(o.total).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Text size="sm" variant="muted">
                              {o.placedAt?.toLocaleDateString() ?? '—'}
                            </Text>
                          </TableCell>
                          <TableCell className="text-right">
                            <DetachOrderButton dealId={deal.id} orderId={o.id} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Stack direction="row" align="center" justify="between">
                  <CardTitle>
                    <Stack direction="row" align="center" gap={2}>
                      <FileText className="h-4 w-4" /> Attached quotes
                      <Badge variant="outline">{attachedQuotes.length}</Badge>
                    </Stack>
                  </CardTitle>
                  <AttachQuotePopover
                    dealId={deal.id}
                    attachedIds={attachedQuotes.map((q) => q.id)}
                    candidates={candidateQuotes.items.map((q) => ({
                      id: q.id,
                      quoteNumber: q.quoteNumber,
                      status: q.status,
                      total: q.total.toString(),
                      currency: q.currency,
                    }))}
                  />
                </Stack>
              </CardHeader>
              <CardContent>
                {attachedQuotes.length === 0 ? (
                  <EmptyState
                    title="No attached quotes"
                    description="Quotes attached to this deal show up here. Use the Attach quote button above."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Valid until</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attachedQuotes.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell>
                            <Link
                              href={`/crm/quotes/${q.id}`}
                              className="text-sm font-medium hover:text-[var(--module-active)] hover:underline"
                            >
                              {q.quoteNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {q.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {q.currency} {Number(q.total).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Text size="sm" variant="muted">
                              {q.validUntil?.toLocaleDateString() ?? '—'}
                            </Text>
                          </TableCell>
                          <TableCell className="text-right">
                            <DetachQuoteButton dealId={deal.id} quoteId={q.id} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </Stack>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <Text size="sm" variant="muted">
                  No activity yet on this deal.
                </Text>
              ) : (
                <Stack gap={3}>
                  {activities.map((a) => (
                    <Stack key={a.id} gap={1}>
                      <Stack direction="row" align="center" justify="between">
                        <Badge variant="outline" className="text-xs">
                          {a.type}
                        </Badge>
                        <Text size="xs" variant="muted">
                          {a.occurredAt.toLocaleDateString()}
                        </Text>
                      </Stack>
                      {a.description && <Text size="sm">{a.description}</Text>}
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
