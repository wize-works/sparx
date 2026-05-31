import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, Receipt, Calendar, User, Briefcase } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { stageColor } from '../../pipelines/[id]/_components/kanban-types';
import { AttachOrderPopover, DetachOrderButton } from './_components/attach-order-popover';
import { AttachQuotePopover, DetachQuoteButton } from './_components/attach-quote-popover';
import { StagePicker } from './_components/stage-picker';

interface Deal {
  id: string;
  title: string;
  pipelineId: string;
  stageId: string;
  value: string | number;
  currency: string;
  customerId: string | null;
  closedAt: string | null;
  expectedCloseDate: string | null;
}

interface PipelineStage {
  id: string;
  name: string;
  stageType: 'open' | 'won' | 'lost';
  probability: string | number;
  color: string | null;
}

interface PipelineDetail {
  id: string;
  name: string;
  stages: PipelineStage[];
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  total: string | number;
  placedAt: string | null;
}

interface QuoteSummary {
  id: string;
  quoteNumber: string;
  status: string;
  currency: string;
  total: string | number;
  validUntil: string | null;
}

interface CustomerSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
}

interface ActivityRow {
  id: string;
  type: string;
  description: string | null;
  occurredAt: string;
}

// Detail content for a CRM deal. Mounted by the full-page route and by the
// dashboard shell's drawer / modal. The full-page chrome (back-to-pipeline
// link, Container width) lives in page.tsx.

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

export async function DealDetailContent({ id }: Props) {
  let deal: Deal;
  try {
    deal = await api.get<Deal>(`/v1/crm/deals/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const customerFilter = deal.customerId ? `&customer_id=${deal.customerId}` : '';
  const [
    pipeline,
    attachedOrders,
    attachedQuotes,
    activities,
    customer,
    candidateOrdersResp,
    candidateQuotesResp,
  ] = await Promise.all([
    api.get<PipelineDetail>(`/v1/crm/pipelines/${deal.pipelineId}`),
    api.get<OrderSummary[]>(`/v1/crm/deals/${deal.id}/orders`),
    api.get<QuoteSummary[]>(`/v1/crm/deals/${deal.id}/quotes`),
    api.get<ActivityRow[]>(`/v1/crm/activities?deal_id=${deal.id}&take=20`),
    deal.customerId
      ? api.get<CustomerSummary>(`/v1/crm/customers/${deal.customerId}`).catch(() => null)
      : Promise.resolve(null),
    api.getPaged<OrderSummary[]>(`/v1/crm/orders?take=100&sort_by=placedAt${customerFilter}`),
    api.getPaged<QuoteSummary[]>(`/v1/crm/quotes?take=100&sort_by=createdAt${customerFilter}`),
  ]);
  const candidateOrders = candidateOrdersResp.data;
  const candidateQuotes = candidateQuotesResp.data;
  const stage = pipeline.stages.find((s) => s.id === deal.stageId);

  return (
    <Stack gap={6}>
      <Stack gap={2}>
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
          {!deal.closedAt && (
            <StagePicker
              dealId={deal.id}
              currentStageId={deal.stageId}
              stages={pipeline.stages.map((s) => ({
                id: s.id,
                name: s.name,
                probability: Number(s.probability),
              }))}
            />
          )}
          {deal.closedAt && (
            <Badge color={stage?.stageType === 'won' ? 'success' : 'warning'}>
              Closed {new Date(deal.closedAt).toLocaleDateString()}
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
                ? `Expected ${new Date(deal.expectedCloseDate).toLocaleDateString()}`
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
                  candidates={candidateOrders.map((o) => ({
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
                            {o.placedAt ? new Date(o.placedAt).toLocaleDateString() : '—'}
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
                  candidates={candidateQuotes.map((q) => ({
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
                            {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : '—'}
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
                        {new Date(a.occurredAt).toLocaleDateString()}
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
  );
}
