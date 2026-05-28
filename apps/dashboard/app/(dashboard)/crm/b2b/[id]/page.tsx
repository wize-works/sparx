import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, AlertTriangle, Globe } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { CrmNotFoundError, b2bAccountService } from '@sparx/crm';
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
  Text,
} from '@sparx/ui';

import { CreditHoldToggle } from './_components/credit-hold-toggle';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  active: 'success',
  credit_hold: 'warning',
  suspended: 'danger',
  inactive: 'outline',
};

export default async function B2bAccountDetailPage({ params }: PageProps) {
  const session = await requireSession();
  const { id } = await params;
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let account;
  try {
    account = await b2bAccountService.get(ctx, id);
  } catch (err) {
    if (err instanceof CrmNotFoundError) notFound();
    throw err;
  }

  const limit = Number(account.creditLimit);
  const used = Number(account.creditUsed);
  const remaining = Math.max(0, limit - used);
  const utilization = limit > 0 ? (used / limit) * 100 : 0;
  const profiles = Array.isArray(account.engineProfiles) ? account.engineProfiles : [];

  return (
    <Container size="xl">
      <Stack gap={6} className="py-8">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/b2b">
              <ArrowLeft className="h-3.5 w-3.5" /> All B2B accounts
            </Link>
          </Button>
          <Stack direction="row" align="center" justify="between" wrap gap={3}>
            <Stack direction="row" align="center" gap={3} wrap>
              <Building2 className="h-5 w-5" />
              <Heading level={1}>{account.companyName}</Heading>
              <Badge variant={STATUS_VARIANT[account.status] ?? 'outline'}>{account.status}</Badge>
              {account.pricingTier && <Badge variant="module">{account.pricingTier}</Badge>}
              {account.website && (
                <a
                  href={account.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm hover:text-[var(--module-active)] hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              )}
            </Stack>
            <CreditHoldToggle accountId={account.id} currentStatus={account.status} />
          </Stack>
        </Stack>

        <div className="grid gap-4 md:grid-cols-4">
          <Card variant="module">
            <CardContent className="py-4">
              <Stat label="Credit limit" value={`$${limit.toLocaleString()}`} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="Used" value={`$${used.toLocaleString()}`} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="Remaining" value={`$${remaining.toLocaleString()}`} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Stat label="Discount" value={`${Number(account.discountPercent)}%`} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Credit utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack gap={2}>
              <div className="h-3 rounded-full bg-[var(--color-surface-subtle)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, utilization).toFixed(1)}%`,
                    backgroundColor:
                      utilization >= 90
                        ? 'var(--color-danger-500)'
                        : utilization >= 75
                          ? 'var(--color-warning-500)'
                          : 'var(--module-active)',
                  }}
                />
              </div>
              <Stack direction="row" justify="between">
                <Text size="sm" variant="muted">
                  {utilization.toFixed(1)}% used
                </Text>
                {utilization >= 75 && (
                  <Stack direction="row" align="center" gap={1}>
                    <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-warning-500)]" />
                    <Text size="sm" className="text-[var(--color-warning-500)]">
                      Near credit limit
                    </Text>
                  </Stack>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {profiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Engine profiles</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                {profiles.map((p, idx) => (
                  <Stack
                    key={idx}
                    direction="row"
                    gap={3}
                    className="rounded-md border border-[var(--color-border-default)] p-3"
                  >
                    <Badge variant="outline">{(p as { year?: number }).year ?? '—'}</Badge>
                    <Text size="sm">
                      {(p as { make?: string }).make ?? '—'} {(p as { model?: string }).model ?? ''}
                    </Text>
                    {(p as { engine?: string }).engine && (
                      <Text size="sm" variant="muted">
                        {(p as { engine?: string }).engine}
                      </Text>
                    )}
                    {(p as { count?: number }).count !== undefined && (
                      <Badge variant="outline" className="ml-auto">
                        ×{(p as { count?: number }).count}
                      </Badge>
                    )}
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}

        {account.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Text size="sm" className="whitespace-pre-wrap">
                {account.notes}
              </Text>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
