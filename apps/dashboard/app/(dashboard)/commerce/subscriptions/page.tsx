import Link from 'next/link';
import { PackageOpen, Repeat2 } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { subscriptionService } from '@sparx/commerce';
import type { SubscriptionStatus } from '@sparx/commerce-schemas';
import {
  Badge,
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

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Auto-ship + recurring billing."
        description="Activate the Commerce module from Billing to manage subscriptions."
        features={[]}
      />
    );
  }

  const { status: statusParam } = await searchParams;
  const status = isStatus(statusParam) ? statusParam : undefined;

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const { items, total } = await subscriptionService.list(ctx, {
    ...(status ? { status } : {}),
    take: 100,
  });

  const mrrCents = items.reduce((sum, s) => sum + s.monthlyRecurringRevenueCents, 0);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Repeat2 className="h-5 w-5" />
            <Heading level={1}>Subscriptions</Heading>
            <Badge variant="module">
              {total} total · ${(mrrCents / 100).toFixed(2)} MRR
            </Badge>
          </Stack>
          <Text variant="muted">
            Auto-ship orders driven by the subscription-billing worker. Renewal Orders land in CRM →
            Orders with source=<code>subscription_renewal</code> so the rest of the fulfillment
            pipeline treats them identically to one-off purchases. Pause / skip / cancel actions
            live on the detail page.
          </Text>
        </Stack>

        <Stack direction="row" gap={2}>
          <FilterLink current={status} value={undefined} label={`All (${total})`} />
          <FilterLink current={status} value="active" label="Active" />
          <FilterLink current={status} value="trialing" label="Trialing" />
          <FilterLink current={status} value="paused" label="Paused" />
          <FilterLink current={status} value="past_due" label="Past due" />
          <FilterLink current={status} value="cancelled" label="Cancelled" />
        </Stack>

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

function FilterLink({
  current,
  value,
  label,
}: {
  current: SubscriptionStatus | undefined;
  value: SubscriptionStatus | undefined;
  label: string;
}) {
  const isActive = current === value || (current === undefined && value === undefined);
  const href = value ? `/commerce/subscriptions?status=${value}` : '/commerce/subscriptions';
  return (
    <Link
      href={href}
      className={
        isActive
          ? 'rounded bg-[var(--module-active)] px-3 py-1 text-xs text-white'
          : 'rounded border border-[var(--color-border-default)] px-3 py-1 text-xs hover:bg-[var(--color-bg-subtle)]'
      }
    >
      {label}
    </Link>
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
  return <Badge variant={variant[status]}>{status}</Badge>;
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
