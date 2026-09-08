'use client';

// Payment providers — the services that take a customer's money and pass it to
// you, and which one is doing it now.
//
// This is a real surface: the catalog, the chosen provider, and whether it can
// take payments all come from live endpoints. Setting one up is genuine work
// (saving API keys, or a hosted onboarding that finishes on the provider's own
// page), so each provider opens its own pane rather than a here-and-gone dialog.
// Nothing offers a "Connect" that goes nowhere — every provider row opens a pane
// that does the real thing, or says plainly what it needs.

import { Badge, Card, Text } from '@wizeworks/silicaui-react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import { faServer, faStar } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';

/** Registry module for this pane, so the brand draws Sell's own picture rather
 *  than the generic one. */
const MODULE = 'commerce';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  checkoutSummary,
  gatewayState,
  paymentsErrorMessage,
  type GatewayDescriptor,
  type MaskedGatewayCredential,
  type PaymentConfig,
  useGatewayCatalog,
  useGatewayCredentials,
  usePaymentConfig,
} from './providers-data';
import { productCopy, productHidesFeature } from '../../lib/product';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function GatewayRow({
  gateway,
  config,
  credential,
  onOpen,
}: {
  gateway: GatewayDescriptor;
  config: PaymentConfig | undefined;
  credential: MaskedGatewayCredential | undefined;
  onOpen: (id: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = gatewayState(gateway, config, credential);
  // A gateway with no adapter yet cannot be opened, because the pane behind this row
  // offers "use this provider" — and selecting one that cannot charge a card would
  // leave checkout throwing GatewayNotFoundError on a live store. The row still
  // renders, so the catalog stays honest about what is coming; it just does nothing.
  const unbuilt = gateway.availability === 'coming_soon';
  return (
    <button
      type="button"
      disabled={unbuilt}
      aria-disabled={unbuilt}
      className="hover:bg-base-200 flex w-full flex-wrap items-center gap-2 rounded px-2 py-2 text-left disabled:cursor-default disabled:hover:bg-transparent"
      onClick={(event) => {
        if (unbuilt) return;
        onOpen(gateway.id, event);
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="font-semibold">{gateway.name}</span>
          {gateway.recommended ? (
            <Badge color="module" variant="soft" size="sm">
              <Icon glyph={faStar} className="size-3" aria-hidden />
              Recommended
            </Badge>
          ) : null}
        </span>
        <Text as="span" className="text-sm">
          {gateway.feeNote}
        </Text>
      </span>
      <Badge color={state.tone} variant="soft" size="sm">
        {state.label}
      </Badge>
    </button>
  );
}

export function PaymentProvidersSurface({ ctx }: { ctx: SurfaceContext }) {
  const config = usePaymentConfig();
  const catalog = useGatewayCatalog();
  const credentials = useGatewayCredentials();

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.provider.detail', { id }, { target: targetFor(event) });
  };

  const isFetching = config.isFetching || catalog.isFetching || credentials.isFetching;
  const refetchAll = () => {
    void config.refetch();
    void catalog.refetch();
    void credentials.refetch();
  };

  // The catalogue is the PLATFORM's list of processors. A brand that does not
  // operate one of them does not offer it — sparx Pay is WizeWorks' own
  // first-party gateway under the sparx brand, and a Piggles customer cannot
  // sign up for it, so it is absent rather than listed-and-broken.
  // See ProductAdapter.hiddenFeatures.
  const gateways = (catalog.data ?? []).filter(
    (gateway) => !productHidesFeature(`commerce.payments.${gateway.id}`)
  );
  const credByGateway = new Map((credentials.data ?? []).map((c) => [c.gatewayId, c]));
  const active = config.data && gateways.find((g) => g.id === config.data?.gatewayId);
  const summary = checkoutSummary(active ?? undefined, Boolean(config.data?.isActive));

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Payment providers controls"
        status={
          summary ? (
            <Badge color={summary.tone} variant="soft" size="sm">
              {summary.label}
            </Badge>
          ) : null
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={config.data ? config.dataUpdatedAt : undefined}
            onRefresh={refetchAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {/* Both non-ready states are carded, because the ready one is a
              FormSection — already a card. */}
          {config.isError || catalog.isError ? (
            <Card>
              <PaneLoadError
                module={MODULE}
                icon={<Icon glyph={faServer} className="size-6" aria-hidden />}
                title="Could not load your payment providers"
                description={paymentsErrorMessage(
                  config.error ?? catalog.error,
                  'This is a problem reaching the server. Your payment setup is unaffected.'
                )}
                onRetry={refetchAll}
              />
            </Card>
          ) : config.isPending || catalog.isPending ? (
            <Card>
              <PaneWaiting module={MODULE} />
            </Card>
          ) : (
            <>
              <Text className="text-sm">
                {active && config.data?.isActive
                  ? active.id === 'manual'
                    ? // Manual is the ONE active provider that takes no card. Saying it
                      // does contradicted the row directly beneath — "No fee. No online
                      // card processing" — in the same eyeful, and told a business the
                      // opposite of the decision they had just made.
                      `You're set up with ${active.name}. You take the money yourself — checkout places the order and nothing is charged online.`
                    : `You're set up with ${active.name} and can take card payments now. Switch to another provider below at any time.`
                  : productCopy(
                      'commerce.payments.chooseIntro',
                      'Choose the service that takes your customers’ payments. sparx Pay is the fastest to start; you can also connect your own processor if you already have one.'
                    )}
              </Text>

              <FormSection
                title="Choose how you get paid"
                description="Pick one provider to handle checkout. Open any of them to set it up or switch to it."
              >
                <div className="flex flex-col">
                  {gateways.map((gateway) => (
                    <GatewayRow
                      key={gateway.id}
                      gateway={gateway}
                      config={config.data}
                      credential={credByGateway.get(gateway.id)}
                      onOpen={open}
                    />
                  ))}
                </div>
              </FormSection>

              <RowOpenHint />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
