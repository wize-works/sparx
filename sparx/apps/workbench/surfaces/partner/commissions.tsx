'use client';

// Commissions — what you have earned from the accounts you brought in, and when
// it gets paid.
//
// Three read-only truths stacked in one capped column: a summary of what you have
// earned and what is still accruing; how you get paid (the payout account); and
// the two ledgers — every commission as it accrues, and every monthly deposit
// that settles them. Money is a transaction view, so it keeps an identity heading
// and there is nothing to edit — the only action is connecting a bank to be paid
// into, which is a one-time setup, not a per-row move.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Banknote, Coins } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  useCommissions,
  useConnectPayouts,
  usePartnerProfile,
  usePayouts,
  partnerErrorMessage,
  type PartnerCommission,
  type PartnerPayoutRun,
} from './data';
import {
  commissionKindLabel,
  commissionState,
  formatCents,
  formatDate,
  payoutState,
} from './format';
import { NotAPartner, PartnerLoadError, PartnerLoading } from './gate';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function sumBy(rows: PartnerCommission[], statuses: string[]): number {
  return rows.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c.amountCents, 0);
}

/** A single earnings figure. The number is the hero; the label sits under it as a
 *  caption, not above it as an eyebrow. */
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card bg-base-100 flex flex-col gap-1 p-4">
      <Text className="text-2xl font-semibold tabular-nums">{value}</Text>
      <Text className="text-sm font-medium">{label}</Text>
      <Text className="text-sm">{hint}</Text>
    </div>
  );
}

function PayoutSetup({ connected }: { connected: boolean }) {
  const toast = useToast();
  const connect = useConnectPayouts();

  const start = () => {
    const here = window.location.href;
    connect.mutate(
      { returnUrl: here, refreshUrl: here },
      {
        onSuccess: (result) => {
          window.location.assign(result.url);
        },
        onError: (error) => {
          toast.add({
            title: 'Could not start payout setup',
            description: partnerErrorMessage(
              error,
              'We could not reach the payments provider just now. Try again shortly.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  if (connected) {
    return (
      <Alert color="success" variant="soft">
        <AlertContent>
          <AlertTitle>Your bank is connected</AlertTitle>
          <AlertDescription>
            Approved commissions are paid to your connected account once they clear the threshold
            below. You can update your bank details any time.
          </AlertDescription>
        </AlertContent>
        <Button
          size="sm"
          variant="outline"
          color="neutral"
          loading={connect.isPending}
          onClick={start}
        >
          Update bank details
        </Button>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Text className="text-sm">
        Connect a bank account so sparx can pay your commissions. Setup is handled by our payments
        provider — you will be taken there to confirm your details, then brought back here.
      </Text>
      <Button
        color="module"
        size="sm"
        className="self-start"
        loading={connect.isPending}
        onClick={start}
      >
        <Banknote className="size-4" aria-hidden />
        Set up payouts
      </Button>
    </div>
  );
}

function CommissionRow({ commission }: { commission: PartnerCommission }) {
  const state = commissionState(commission.status);
  return (
    <tr>
      <td className="align-top whitespace-nowrap">{formatDate(commission.createdAt)}</td>
      <td className="hidden align-top @lg:table-cell">{commissionKindLabel(commission.kind)}</td>
      <td className="align-top">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
      <td className="text-right align-top font-medium tabular-nums">
        {formatCents(commission.amountCents, commission.currency)}
      </td>
    </tr>
  );
}

function PayoutRow({ payout }: { payout: PartnerPayoutRun }) {
  const state = payoutState(payout.status);
  return (
    <tr>
      <td className="align-top whitespace-nowrap">
        {formatDate(payout.paidAt ?? payout.createdAt)}
      </td>
      <td className="hidden align-top whitespace-nowrap tabular-nums @lg:table-cell">
        {payout.commissionCount === 1
          ? '1 commission'
          : `${String(payout.commissionCount)} commissions`}
      </td>
      <td className="align-top">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
      <td className="text-right align-top font-medium tabular-nums">
        {formatCents(payout.amountCents, payout.currency)}
      </td>
    </tr>
  );
}

export function CommissionsSurface(_props: { ctx: SurfaceContext }) {
  const profile = usePartnerProfile();
  const commissions = useCommissions();
  const payouts = usePayouts();

  const refetchAll = () => {
    void profile.refetch();
    void commissions.refetch();
    void payouts.refetch();
  };

  const busy = profile.isFetching || commissions.isFetching || payouts.isFetching;
  const updatedAt = commissions.data ? commissions.dataUpdatedAt : undefined;

  const shell = (children: React.ReactNode) => (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Commissions controls"
        status={
          <span className="inline-flex items-center gap-1.5">
            <Coins className="size-4" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              Your earnings
            </Text>
          </span>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={busy}
            updatedAt={updatedAt}
            onRefresh={refetchAll}
          />
        }
      />
      {children}
    </div>
  );

  if (profile.isError) {
    return <PartnerLoadError section="commissions" error={profile.error} onRetry={refetchAll} />;
  }
  if (commissions.isError) {
    return (
      <PartnerLoadError section="commissions" error={commissions.error} onRetry={refetchAll} />
    );
  }
  if (profile.isPending || commissions.isPending || payouts.isPending) {
    return <PartnerLoading />;
  }
  if (!profile.data) {
    return <NotAPartner section="Commissions" />;
  }

  const rows = commissions.data;
  const payoutRows = payouts.data ?? [];
  const paidCents = sumBy(rows, ['paid']);
  const pendingCents = sumBy(rows, ['pending', 'approved']);
  const currency = rows[0]?.currency ?? 'USD';

  return shell(
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            Commissions
          </Heading>
          <Text>
            What you have earned bringing businesses onto sparx, what is still accruing, and every
            deposit that has settled it.
          </Text>
        </div>

        <div className="grid gap-3 @md:grid-cols-3">
          <Stat
            label="Paid to you"
            value={formatCents(paidCents, currency)}
            hint="Across every payout"
          />
          <Stat
            label="Still to come"
            value={formatCents(pendingCents, currency)}
            hint="Earned, not yet paid"
          />
          <Stat
            label="Payout threshold"
            value={formatCents(profile.data.payoutMinCents, currency)}
            hint="The minimum before a payout runs"
          />
        </div>

        <FormSection title="Getting paid">
          <PayoutSetup connected={profile.data.stripePayoutAccountId != null} />
        </FormSection>

        <section className="card bg-base-100 overflow-hidden">
          <header className="border-base-300 border-b px-4 py-3">
            <Heading level={2} className="text-base font-semibold">
              Every commission
            </Heading>
          </header>
          {rows.length === 0 ? (
            <div className="p-4">
              <Text className="text-sm">
                Nothing yet. When a business you referred makes its first payment to sparx, your
                commission accrues here at the rate that was set when they signed up.
              </Text>
            </div>
          ) : (
            <div className="px-2">
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="hidden @lg:table-cell">For</th>
                    <th>Progress</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((commission) => (
                    <CommissionRow key={commission.id} commission={commission} />
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </section>

        <section className="card bg-base-100 overflow-hidden">
          <header className="border-base-300 border-b px-4 py-3">
            <Heading level={2} className="text-base font-semibold">
              Deposits to your bank
            </Heading>
          </header>
          {payoutRows.length === 0 ? (
            <div className="p-4">
              <Text className="text-sm">
                No deposits yet. Once your cleared commissions add up past the threshold, they are
                grouped into a monthly deposit to your bank and each one is listed here.
              </Text>
            </div>
          ) : (
            <div className="px-2">
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="hidden @lg:table-cell">Settles</th>
                    <th>Status</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRows.map((payout) => (
                    <PayoutRow key={payout.id} payout={payout} />
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
