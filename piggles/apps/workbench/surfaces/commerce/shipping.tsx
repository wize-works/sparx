'use client';

// Shipping — the whole-business view of how you deliver.
//
// Two things live here, and they answer two different questions. DELIVERY
// REGIONS (zones) answer "where do you deliver, and what does it cost there?" —
// this is where nearly every shop spends its time. PRODUCT GROUPS (profiles)
// answer "do some products ship differently from the rest?" — most shops have
// one group and never touch it, so it sits second.
//
// Each row opens its own create-and-manage pane. Rates (the actual delivery
// options and their prices) are edited inside a region, because a price only
// means something once you know the region it applies to.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Text,
} from '@wizeworks/silicaui-react';
import { faBoxes, faPlus, faServer, faTruck } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { InlineWaiting } from '../../components/inline-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { coverageSummary } from './geo';

/** Registry module for this pane, so the brand draws Sell's own picture rather
 *  than the generic one. */
const MODULE = 'commerce';
import {
  shippingErrorMessage,
  useShippingProfiles,
  useShippingReadiness,
  useShippingZones,
  type ShippingProfile,
  type ShippingZone,
} from './shipping-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function ZoneRow({ zone, onOpen }: { zone: ShippingZone; onOpen: RowOpen }) {
  return (
    <button
      type="button"
      className="hover:bg-base-200 flex w-full flex-wrap items-center gap-2 rounded px-2 py-2 text-left"
      onClick={(event) => {
        onOpen('commerce.shipping.zone.detail', zone.id, event);
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{zone.name}</span>
        <Text as="span" className="text-sm">
          {coverageSummary(zone.targeting.countries)}
        </Text>
      </span>
      {zone.rateCount === 0 ? (
        <Badge color="warning" variant="soft" size="sm">
          No delivery options yet
        </Badge>
      ) : (
        <Badge color="neutral" variant="soft" size="sm">
          {zone.rateCount === 1 ? '1 option' : `${String(zone.rateCount)} options`}
        </Badge>
      )}
    </button>
  );
}

function ProfileRow({ profile, onOpen }: { profile: ShippingProfile; onOpen: RowOpen }) {
  const count = profile.productCount + profile.variantCount;
  return (
    <button
      type="button"
      className="hover:bg-base-200 flex w-full flex-wrap items-center gap-2 rounded px-2 py-2 text-left"
      onClick={(event) => {
        onOpen('commerce.shipping.profile.detail', profile.id, event);
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{profile.name}</span>
        {profile.requiresFreight || profile.requiresSignature ? (
          <Text as="span" className="text-sm">
            {[
              profile.requiresFreight ? 'Ships as freight' : null,
              profile.requiresSignature ? 'Needs a signature' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </span>
      <Text as="span" className="shrink-0 text-sm tabular-nums">
        {/* "All other products" belongs to the DEFAULT group and to nothing
            else. It used to be shown for any group with no members, which made
            a brand-new empty group claim the whole catalog on the one screen an
            owner checks her delivery prices on. */}
        {profile.isDefault
          ? 'All other products'
          : count === 0
            ? 'Nothing in it yet'
            : count === 1
              ? '1 product'
              : `${String(count)} products`}
      </Text>
    </button>
  );
}

type RowOpen = (surface: string, id: string, event: { shiftKey: boolean; altKey: boolean }) => void;

export function ShippingSurface({ ctx }: { ctx: SurfaceContext }) {
  const zones = useShippingZones();
  const profiles = useShippingProfiles();
  const readiness = useShippingReadiness();

  // A carrier is connected but live rates can't actually be calculated because
  // the ship-from address is incomplete — checkout silently falls back to manual
  // rates, so the merchant would never otherwise learn why USPS/UPS don't show
  // (docs/bugs/BUG-010). Warn them here, where they set delivery up.
  const shipFromWarning =
    readiness.data && readiness.data.liveCarrierConnected && !readiness.data.shipFromComplete
      ? readiness.data.shipFromIssue
      : null;

  const open: RowOpen = (surface, id, event) => {
    ctx.open(surface, { id }, { target: targetFor(event) });
  };

  const isFetching = zones.isFetching || profiles.isFetching;
  const updatedAt = Math.max(zones.dataUpdatedAt, profiles.dataUpdatedAt) || undefined;

  const zoneRows = zones.data?.items ?? [];
  const profileRows = profiles.data?.items ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Shipping controls"
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={zones.data ? updatedAt : undefined}
            onRefresh={() => {
              void zones.refetch();
              void profiles.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {/* Carded, because the branch beside it is a stack of FormSections —
              each already a card. */}
          {zones.isError ? (
            <Card>
              <PaneLoadError
                module={MODULE}
                icon={<Icon glyph={faServer} className="size-6" aria-hidden />}
                title="Could not load your shipping setup"
                description={shippingErrorMessage(
                  zones.error,
                  'This is a problem reaching the server. Your delivery settings are unaffected.'
                )}
                onRetry={() => {
                  void zones.refetch();
                  void profiles.refetch();
                }}
              />
            </Card>
          ) : (
            <>
              <Text className="text-sm">
                Set up the places you deliver to and what each delivery option costs. Shoppers see
                the options for wherever their address is, and pay the price you set here.
              </Text>

              {shipFromWarning ? (
                <Alert color="warning">
                  <AlertContent>
                    <AlertTitle>Live carrier rates are turned off right now</AlertTitle>
                    <AlertDescription>
                      {shipFromWarning} Until then, shoppers only see the delivery options you set
                      up below — your connected carrier’s live prices won’t appear at checkout.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}

              {/* No regions means no delivery has been set up, and the quote
                  answers that with collection rather than by inventing a
                  postage rate (issue #031). The merchant has to be TOLD that,
                  or the first they learn of it is an order with no address. */}
              {!zones.isPending && zoneRows.length === 0 ? (
                <Alert color="info">
                  <AlertContent>
                    <AlertTitle>Right now, customers collect from you</AlertTitle>
                    <AlertDescription>
                      You haven’t set up any delivery yet, so the only choice at checkout is to come
                      and collect — nothing gets posted, and nothing is charged for delivery. That’s
                      exactly right for a shop people come to. If you do post orders out, add a
                      region below and set what you charge.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}

              <FormSection
                title="Delivery regions"
                description="A region is a set of places you deliver to. Each one holds the delivery options a shopper there can choose from."
                action={
                  <Button
                    size="sm"
                    color="module"
                    onClick={(event) => {
                      open('commerce.shipping.zone.detail', 'new', event);
                    }}
                  >
                    <Icon glyph={faPlus} className="size-4" aria-hidden />
                    Add a region
                  </Button>
                }
              >
                {zones.isPending ? (
                  <InlineWaiting />
                ) : zoneRows.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={<Icon glyph={faTruck} className="size-6" aria-hidden />}
                    title="You don’t deliver — people collect"
                    description="That’s all set up and working. If you start posting orders out, add your first region — for example one covering your own country — then give it a delivery option and a price."
                  />
                ) : (
                  <div className="flex flex-col">
                    {zoneRows.map((zone) => (
                      <ZoneRow key={zone.id} zone={zone} onOpen={open} />
                    ))}
                  </div>
                )}
              </FormSection>

              <FormSection
                title="Product groups"
                description="Most shops need just one. Add another only if some products ship differently — bulky freight, or anything that needs a signature — so they can be priced on their own."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    color="neutral"
                    onClick={(event) => {
                      open('commerce.shipping.profile.detail', 'new', event);
                    }}
                  >
                    <Icon glyph={faPlus} className="size-4" aria-hidden />
                    Add a group
                  </Button>
                }
              >
                {profiles.isPending ? (
                  <InlineWaiting />
                ) : profileRows.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={<Icon glyph={faBoxes} className="size-6" aria-hidden />}
                    title="No product groups yet"
                    description="Every product ships the same way until you add a group. Add one to price a set of products separately."
                  />
                ) : (
                  <div className="flex flex-col">
                    {profileRows.map((profile) => (
                      <ProfileRow key={profile.id} profile={profile} onOpen={open} />
                    ))}
                  </div>
                )}
              </FormSection>

              <RowOpenHint />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
