import Link from 'next/link';
import { CreditCard, PackageOpen } from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
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
import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

// Diagnostic view — in-flight checkout sessions. Useful when a customer
// support ticket says "checkout is stuck" — staff finds the session,
// inspects the step + provider refs, and either waits, expires, or
// nudges the customer.

const STEP_ORDER = ['cart_review', 'contact', 'shipping', 'payment', 'review'] as const;

export default async function CheckoutSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Diagnostic — in-flight checkouts."
        description="Activate the Commerce module from Billing to inspect checkout sessions."
        features={[]}
      />
    );
  }

  const { step } = await searchParams;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  const sessions = await withTenant(ctx, async (tx) => {
    return tx.checkoutSession.findMany({
      where: step ? { step } : { step: { in: [...STEP_ORDER] } },
      include: {
        customer: { select: { email: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  });

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <CreditCard className="h-5 w-5" />
            <Heading level={1}>Checkout sessions</Heading>
            <Badge variant="module">{sessions.length} in-flight</Badge>
          </Stack>
          <Text variant="muted">
            Read-only diagnostic. The state machine advances cart_review → contact → shipping →
            payment → review → completed. Sessions stuck in a non-terminal step are auto-expired on
            TTL by the worker; staff can manually expire a session from the API if needed.
          </Text>
        </Stack>

        <Stack direction="row" gap={2} wrap>
          <FilterLink current={step} value={undefined} label="All in-flight" />
          {STEP_ORDER.map((s) => (
            <FilterLink key={s} current={step} value={s} label={s} />
          ))}
          <FilterLink current={step} value="completed" label="Completed" />
          <FilterLink current={step} value="expired" label="Expired" />
        </Stack>

        <Card>
          <CardHeader>
            <Stack gap={1}>
              <Heading level={3}>{step ? labelForStep(step) : 'Active'}</Heading>
              <CardDescription>
                Click a cart ID to see the items + pricing trace; the session lifecycle is the table
                here.
              </CardDescription>
            </Stack>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <EmptyState
                icon={<CreditCard className="h-5 w-5" />}
                title="No sessions"
                description="Checkout sessions appear here when the storefront starts writing."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session</TableHead>
                    <TableHead>Cart</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Provider refs</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Text size="xs" className="font-mono">
                          {s.id.slice(0, 8)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/carts/${s.cartId}`}
                          entityType="cart"
                          entityId={s.cartId}
                          className="font-mono text-xs hover:text-[var(--module-active)]"
                        >
                          {s.cartId.slice(0, 8)}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>{s.customer?.email ?? s.customerEmail ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{s.channel}</Badge>
                      </TableCell>
                      <TableCell>
                        <StepBadge step={s.step} />
                      </TableCell>
                      <TableCell>
                        ${(s.totalCents / 100).toFixed(2)} {s.currency}
                      </TableCell>
                      <TableCell>
                        <Stack gap={0}>
                          {s.shippingProviderSlug && (
                            <Text size="xs" className="font-mono">
                              ship · {s.shippingProviderSlug}
                            </Text>
                          )}
                          {s.paymentProviderSlug && (
                            <Text size="xs" className="font-mono">
                              pay · {s.paymentProviderSlug}
                            </Text>
                          )}
                          {!s.shippingProviderSlug && !s.paymentProviderSlug && (
                            <Text size="xs" variant="muted">
                              —
                            </Text>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>{new Date(s.updatedAt).toLocaleString()}</TableCell>
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
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const isActive = current === value || (current === undefined && value === undefined);
  const href = value ? `/commerce/checkout-sessions?step=${value}` : '/commerce/checkout-sessions';
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

function StepBadge({ step }: { step: string }) {
  const v: 'success' | 'warning' | 'outline' =
    step === 'completed' ? 'success' : step === 'expired' ? 'warning' : 'outline';
  return <Badge variant={v}>{step}</Badge>;
}

function labelForStep(s: string): string {
  return s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
