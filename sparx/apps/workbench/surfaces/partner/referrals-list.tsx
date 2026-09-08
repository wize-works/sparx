'use client';

// Referrals — the businesses you have sent to sparx, and how far each has got.
//
// The whole point of this surface is the link at the top: share it, and every
// signup that comes through it is credited to you. So the link is the hero — a
// copyable field with the code beside it — and the ledger of who has signed up
// sits underneath it as a read-only table (a genuine transaction view: a business
// name, a date, a rate and a state, which is what a table is for).
//
// Read-only, so there is no detail pane to open a row into — a referral is an
// attribution fact, not a thing you edit. Commission it earns lives on the
// Commissions surface.

import { useState } from 'react';
import { Badge, Button, EmptyState, Heading, Input, Table, Text } from '@wizeworks/silicaui-react';
import { Check, Copy, Share2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useReferrals, type PartnerReferral } from './data';
import { commissionEarningLabel, formatDate, referralState } from './format';
import { PartnerLoadError, PartnerLoading } from './gate';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function ReferralLink({ code }: { code: string }) {
  const link = `https://sparx.works/?ref=${code}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      // Clipboard can be refused (permissions / insecure context). The field is
      // selectable, so the link can still be copied by hand.
    }
  };

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <Heading level={2} className="text-lg font-semibold">
          Your referral link
        </Heading>
        <Text className="text-sm">
          Share this anywhere. When a business signs up through it, they are credited to you, and
          you earn commission on their first payment to sparx.
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          readOnly
          value={link}
          aria-label="Your referral link"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          className="min-w-[16rem] flex-1 font-mono text-sm"
        />
        <Button
          color="module"
          variant="soft"
          onClick={() => {
            void copy();
          }}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <Text className="text-sm">
        Referral code: <span className="font-mono font-medium">{code}</span>
      </Text>
    </section>
  );
}

function ReferralRow({ referral }: { referral: PartnerReferral }) {
  const state = referralState(referral.status);
  return (
    <tr>
      <td className="align-top font-medium">{referral.referredOrgName ?? 'A sparx account'}</td>
      <td className="hidden align-top whitespace-nowrap @lg:table-cell">
        {formatDate(referral.signupAt)}
      </td>
      <td className="hidden align-top whitespace-nowrap tabular-nums @xl:table-cell">
        {commissionEarningLabel(referral.commissionRate, referral.commissionType)}
      </td>
      <td className="align-top">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
    </tr>
  );
}

export function ReferralsListSurface(_props: { ctx: SurfaceContext }) {
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch, error } = useReferrals();
  const referrals = data?.referrals ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Referrals list controls"
        status={
          <Text className="text-sm whitespace-nowrap">
            {referrals.length === 1 ? '1 referral' : `${String(referrals.length)} referrals`}
          </Text>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {isError ? (
        <PartnerLoadError
          section="referrals"
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : isPending ? (
        <PartnerLoading />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={COLUMN}>
            <ReferralLink code={data.referralCode} />

            {referrals.length === 0 ? (
              <EmptyState
                icon={<Share2 className="size-6" aria-hidden />}
                title="No referrals yet"
                description="Share your link above. New businesses that sign up through it appear here, with how far they’ve got and the commission rate you’ll earn."
              />
            ) : (
              <section className="card bg-base-100 overflow-hidden">
                <header className="border-base-300 border-b px-4 py-3">
                  <Heading level={2} className="text-base font-semibold">
                    Businesses you’ve referred
                  </Heading>
                </header>
                <div className="px-2">
                  <Table size="sm">
                    <thead>
                      <tr>
                        <th>Business</th>
                        <th className="hidden @lg:table-cell">Signed up</th>
                        <th className="hidden @xl:table-cell">You earn</th>
                        <th>Progress</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((referral) => (
                        <ReferralRow key={referral.id} referral={referral} />
                      ))}
                    </tbody>
                  </Table>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
