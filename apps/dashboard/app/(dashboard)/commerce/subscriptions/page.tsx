import { Repeat2 } from 'lucide-react';

import {
  Badge,
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
import { ListToolbar } from '../../_components/list-toolbar';

export const dynamic = 'force-dynamic';

type SubscriptionStatus = 'active' | 'trialing' | 'paused' | 'past_due' | 'cancelled';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'paused', label: 'Paused' },
  { value: 'past_due', label: 'Past due' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface SubscriptionSummary {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  nextOccurrenceAt: string | null;
  itemCount: number;
  monthlyRecurringRevenueCents: number;
  currency: string;
  providerSlug: string;
}

interface SubscriptionsListResponse {
  items: SubscriptionSummary[];
  total: number;
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam } = await searchParams;
  const status = isStatus(statusParam) ? statusParam : undefined;

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  query.set('take', '100');
  const { items, total } = await api.get<SubscriptionsListResponse>(
    `/v1/commerce/subscriptions?${query.toString()}`
  );

  const mrrCents = items.reduce((sum, s) => sum + s.monthlyRecurringRevenueCents, 0);

  return (
    <Container size="full">
      <Stack gap={6} className="py-10">
        <PageHeader
          icon={<Repeat2 className="h-5 w-5" />}
          title="Subscriptions"
          badge={
            <Badge color="module">
              {total} total · ${(mrrCents / 100).toFixed(2)} MRR
            </Badge>
          }
          description={
            <>
              Auto-ship orders driven by the subscription-billing worker. Renewal Orders land in CRM
              → Orders with source=<code>subscription_renewal</code> so the rest of the fulfillment
              pipeline treats them identically to one-off purchases. Pause / skip / cancel actions
              live on the detail page.
            </>
          }
        />

        <ListToolbar
          searchable={false}
          filters={[{ key: 'status', label: 'Statuses', options: STATUS_OPTIONS }]}
        />

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>{status ? labelForStatus(status) : 'All subscriptions'}</Heading>
              <CardDescription>
                MRR is normalized to a monthly cadence — annual / weekly / daily subs are converted.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <EmptyState
                icon={<Repeat2 className="h-5 w-5" />}
                title="No subscriptions"
                description="Subscriptions are created from the storefront after a customer signs up for auto-ship; nothing for staff to do here yet."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next charge</TableHead>
                    <TableHead>MRR</TableHead>
                    <TableHead>Provider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/subscriptions/${s.id}`}
                          entityType="subscription"
                          entityId={s.id}
                          className="font-mono text-xs hover:text-[var(--module-active)]"
                        >
                          {s.id.slice(0, 8)}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {s.customerId.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>{s.itemCount}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell>
                        {s.nextOccurrenceAt
                          ? new Date(s.nextOccurrenceAt).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell>
                        ${(s.monthlyRecurringRevenueCents / 100).toFixed(2)} {s.currency}
                      </TableCell>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {s.providerSlug}
                        </Text>
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

function StatusBadge({ status }: { status: SubscriptionStatus }) {
  const variant: Record<SubscriptionStatus, 'success' | 'warning' | 'outline'> = {
    active: 'success',
    trialing: 'outline',
    paused: 'outline',
    past_due: 'warning',
    cancelled: 'outline',
  };
  return <Badge color={variant[status]}>{status}</Badge>;
}

function labelForStatus(s: SubscriptionStatus): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function isStatus(value: string | undefined): value is SubscriptionStatus {
  return (
    value === 'active' ||
    value === 'trialing' ||
    value === 'paused' ||
    value === 'past_due' ||
    value === 'cancelled'
  );
}
