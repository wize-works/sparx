import { notFound } from 'next/navigation';
import { PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { subscriptionService } from '@sparx/commerce';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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

import { ModuleStub } from '../../../../../components/module-stub';

import { SubscriptionActionsBar } from './_components/subscription-actions-bar';

export const dynamic = 'force-dynamic';

interface Props {
  id: string;
}

export async function SubscriptionDetailContent({ id }: Props) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline=""
        description="Activate the Commerce module from Billing to manage subscriptions."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const sub = await subscriptionService.get(ctx, id).catch(() => null);
  if (!sub) notFound();

  return (
    <Stack gap={6}>
      <Stack direction="row" align="end" justify="between" wrap gap={2}>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={2}>
            <Heading level={1} className="font-mono text-2xl">
              {sub.id.slice(0, 8)}
            </Heading>
            <Badge variant={statusVariant(sub.status)}>{sub.status}</Badge>
          </Stack>
          <Text variant="muted">
            Every {sub.intervalCount} {sub.intervalUnit}
            {sub.intervalCount > 1 ? 's' : ''} · {sub.deliveriesPerCycle} per cycle
          </Text>
        </Stack>
        <SubscriptionActionsBar subscriptionId={sub.id} status={sub.status} />
      </Stack>

      <Stack direction="row" gap={4} wrap>
        <Stat label="MRR" value={`$${(sub.monthlyRecurringRevenueCents / 100).toFixed(2)}`} />
        <Stat label="Currency" value={sub.currency} />
        <Stat label="Items" value={String(sub.itemCount)} />
        <Stat
          label="Next charge"
          value={sub.nextOccurrenceAt ? new Date(sub.nextOccurrenceAt).toLocaleDateString() : '—'}
        />
        <Stat
          label="Started"
          value={sub.startedAt ? new Date(sub.startedAt).toLocaleDateString() : '—'}
        />
      </Stack>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Items</Heading>
            <CardDescription>
              Each renewal generates a CRM Order with these line items.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Add-on of</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sub.items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>
                    <Text size="xs" className="font-mono">
                      {it.variantId.slice(0, 8)}
                    </Text>
                  </TableCell>
                  <TableCell>{it.quantity}</TableCell>
                  <TableCell>${(it.unitPriceCents / 100).toFixed(2)}</TableCell>
                  <TableCell>
                    {it.addonOfId ? (
                      <Text size="xs" className="font-mono">
                        {it.addonOfId.slice(0, 8)}
                      </Text>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Lifecycle</Heading>
            <CardDescription>
              The provider drives the actual charge schedule; the platform records the resulting
              state transitions here.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={3}>
            <Row label="Status" value={sub.status} />
            <Row
              label="Period"
              value={
                sub.currentPeriodStart && sub.currentPeriodEnd
                  ? `${new Date(sub.currentPeriodStart).toLocaleDateString()} → ${new Date(
                      sub.currentPeriodEnd
                    ).toLocaleDateString()}`
                  : '—'
              }
            />
            <Row
              label="Trial ends"
              value={sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleString() : '—'}
            />
            <Row
              label="Paused until"
              value={sub.pausedUntil ? new Date(sub.pausedUntil).toLocaleString() : '—'}
            />
            <Row
              label="Cancelled"
              value={sub.cancelledAt ? new Date(sub.cancelledAt).toLocaleString() : '—'}
            />
            <Row label="Provider" value={sub.providerSlug} />
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1} className="rounded border border-[var(--color-border-default)] p-3">
      <Text size="xs" variant="muted">
        {label}
      </Text>
      <Text className="font-medium">{value}</Text>
    </Stack>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" gap={4}>
      <Text size="sm" className="w-40" variant="muted">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Stack>
  );
}

function statusVariant(status: string): 'success' | 'warning' | 'outline' {
  if (status === 'active') return 'success';
  if (status === 'past_due') return 'warning';
  return 'outline';
}
