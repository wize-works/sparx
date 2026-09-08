'use client';

// Your tier — which level of the partner programme you are on, what it earns, and
// what it takes to reach the next one.
//
// A read-only standing view: the current tier and status ride the pane header,
// the ladder shows all three levels with the current one marked, and a small
// earnings summary grounds it in real numbers. Applying to move up is a decision,
// not a form — two facts and a confirm — so it is a confirm dialog, never a modal.

import { Badge, Button, Heading, Text, useToast } from '@wizeworks/silicaui-react';
import { Award, Check } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useApplyTier, usePartnerOverview, partnerErrorMessage } from './data';
import { formatCents, nextTier, partnerStatusState, TIER_ORDER, TIERS } from './format';
import { NotAPartner, PartnerLoadError, PartnerLoading } from './gate';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card bg-base-100 flex flex-col gap-1 p-4">
      <Text className="text-2xl font-semibold tabular-nums">{value}</Text>
      <Text className="text-sm font-medium">{label}</Text>
    </div>
  );
}

export function TierSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const overview = usePartnerOverview();
  const applyTier = useApplyTier();

  if (overview.isError) {
    return (
      <PartnerLoadError
        section="your tier"
        error={overview.error}
        onRetry={() => {
          void overview.refetch();
        }}
      />
    );
  }
  if (overview.isPending) return <PartnerLoading />;
  if (!overview.data) return <NotAPartner section="Your tier" />;

  const { partner, referralCount, activeReferrals, lifetimeCents, pendingCents } = overview.data;
  const status = partnerStatusState(partner.status);
  const upcoming = nextTier(partner.tier);
  const isActive = partner.status === 'active';

  const applyForNext = async () => {
    if (!upcoming) return;
    const meta = TIERS[upcoming];
    const ok = await confirm({
      title: `Apply to become a ${meta.label} partner?`,
      description: `${meta.commission}. Applications are reviewed by sparx, usually within a few business days — nothing changes about your account until it is approved.`,
      confirmLabel: 'Send my application',
      cancelLabel: 'Not now',
      color: 'module',
    });
    if (!ok) return;
    applyTier.mutate(
      { requestedTier: upcoming },
      {
        onSuccess: () => {
          toast.add({
            title: 'Application sent',
            description: `We’ll review your ${meta.label} application and be in touch. You’ll keep earning at your current tier in the meantime.`,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not send that application',
            description: partnerErrorMessage(error, 'Nothing was changed. Try again in a moment.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Tier controls"
        controls={
          <>
            <Badge color="module" variant="soft" size="sm">
              {TIERS[partner.tier].label} partner
            </Badge>
            <Badge color={status.tone} variant="soft" size="sm">
              {status.label}
            </Badge>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={overview.isFetching}
            updatedAt={overview.data ? overview.dataUpdatedAt : undefined}
            onRefresh={() => {
              void overview.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              You’re a {TIERS[partner.tier].label} partner
            </Heading>
            <Text>
              {TIERS[partner.tier].commission}. Here’s where you stand and what it takes to move up.
            </Text>
          </div>

          <div className="grid gap-3 @md:grid-cols-4">
            <Stat label="Referrals" value={String(referralCount)} />
            <Stat label="Now paying" value={String(activeReferrals)} />
            <Stat label="Paid to you" value={formatCents(lifetimeCents)} />
            <Stat label="Still to come" value={formatCents(pendingCents)} />
          </div>

          <div className="grid gap-3 @2xl:grid-cols-3">
            {TIER_ORDER.map((tier) => {
              const meta = TIERS[tier];
              const isCurrent = partner.tier === tier;
              const passed = TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(partner.tier);
              return (
                <section
                  key={tier}
                  className={`card flex flex-col gap-3 p-4 ${isCurrent ? 'bg-module soft' : 'bg-base-100'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Heading level={2} className="text-lg font-semibold">
                      {meta.label}
                    </Heading>
                    {isCurrent ? (
                      <Badge color="module" variant="soft" size="sm">
                        Your tier
                      </Badge>
                    ) : passed ? (
                      <Badge color="success" variant="soft" size="sm">
                        Unlocked
                      </Badge>
                    ) : null}
                  </div>
                  <Text className="text-sm font-medium">{meta.commission}</Text>
                  <ul className="flex flex-col gap-2">
                    {meta.unlocks.map((unlock) => (
                      <li key={unlock} className="flex items-start gap-2">
                        <Check className="text-module mt-0.5 size-4 shrink-0" aria-hidden />
                        <Text className="text-sm">{unlock}</Text>
                      </li>
                    ))}
                  </ul>
                  <Text className="text-sm">{meta.howToReach}</Text>
                </section>
              );
            })}
          </div>

          {upcoming ? (
            <section className="card bg-base-100 flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                <Heading level={2} className="text-lg font-semibold">
                  Move up to {TIERS[upcoming].label}
                </Heading>
                <Text className="text-sm">{TIERS[upcoming].howToReach}</Text>
              </div>
              {isActive ? (
                <Button
                  color="module"
                  size="sm"
                  className="self-start"
                  loading={applyTier.isPending}
                  onClick={() => {
                    void applyForNext();
                  }}
                >
                  <Award className="size-4" aria-hidden />
                  Apply for {TIERS[upcoming].label}
                </Button>
              ) : (
                <Text className="text-sm">
                  You can apply to move up once your partner account is active.
                </Text>
              )}
            </section>
          ) : (
            <section className="card bg-base-100 flex flex-col gap-1 p-4">
              <Heading level={2} className="text-lg font-semibold">
                You’re at the top tier
              </Heading>
              <Text className="text-sm">
                You earn ongoing commission on the accounts you manage and can publish bootcamps
                publicly. Keep it up — the directory rewards active Certified partners with priority
                placement.
              </Text>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
