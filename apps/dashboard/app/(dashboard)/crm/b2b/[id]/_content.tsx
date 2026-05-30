import { notFound } from 'next/navigation';
import { Building2, AlertTriangle, Globe } from 'lucide-react';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Heading,
  Stack,
  Stat,
  Text,
} from '@sparx/ui';

import { api, type ApiRestError } from '@/lib/api-rest-client';

import { CreditHoldToggle } from './_components/credit-hold-toggle';

interface B2bAccount {
  id: string;
  companyName: string;
  status: string;
  pricingTier: string | null;
  website: string | null;
  creditLimit: string | number;
  creditUsed: string | number;
  discountPercent: string | number;
  engineProfiles: unknown;
  notes: string | null;
}

// Detail content for a B2B account. Mounted by the full-page route and by
// the dashboard shell's drawer / modal. Full-page chrome lives in
// page.tsx; this component renders content only.

export const dynamic = 'force-dynamic';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'outline' | 'danger'> = {
  active: 'success',
  credit_hold: 'warning',
  suspended: 'danger',
  inactive: 'outline',
};

interface Props {
  id: string;
}

export async function B2bAccountDetailContent({ id }: Props) {
  let account: B2bAccount;
  try {
    account = await api.get<B2bAccount>(`/v1/crm/b2b-accounts/${id}`);
  } catch (err) {
    if ((err as ApiRestError).code === 'NOT_FOUND') notFound();
    throw err;
  }

  const limit = Number(account.creditLimit);
  const used = Number(account.creditUsed);
  const remaining = Math.max(0, limit - used);
  const utilization = limit > 0 ? (used / limit) * 100 : 0;
  const profiles: unknown[] = Array.isArray(account.engineProfiles) ? account.engineProfiles : [];

  return (
    <Stack gap={6}>
      <Stack gap={2}>
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
              {profiles.map((p: unknown, idx: number) => (
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
  );
}
