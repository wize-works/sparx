'use client';

// One checkout session — how far a shopper got toward paying, and what stopped
// them.
//
// A session is created by the storefront, not by staff, so this READS: the step
// it stalled at, what the shopper had entered, and the totals it computed. The
// one staff move is expiring a stalled session by hand — which releases any
// stock it is holding — offered only while the session is still in flight.
//
// The cart behind the session is one tap away: a session IS a cart part-way
// through checkout, and the basket lives on its own pane.

import { useEffect } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Heading,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { CreditCard, ShoppingCart } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import { ModuleScope } from '../../components/module-scope';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { deferTick } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { addressLines, formatMoney, formatDateTime, type OrderAddress } from './data';
import {
  checkoutChannelLabel,
  checkoutErrorMessage,
  checkoutState,
  isCheckoutLive,
  stepLabel,
  useCheckoutSession,
  useExpireCheckoutSession,
  type CheckoutDetail,
} from './checkout-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function money(cents: number, currency: string): string {
  return formatMoney(cents / 100, currency);
}

function MoneyRow({
  label,
  cents,
  currency,
  emphasis = false,
}: {
  label: string;
  cents: number;
  currency: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-baseline justify-between gap-4',
        emphasis ? 'text-lg font-semibold' : 'text-base',
      ].join(' ')}
    >
      <span>{label}</span>
      <span className="tabular-nums">{money(cents, currency)}</span>
    </div>
  );
}

function AddressBlock({ title, address }: { title: string; address: OrderAddress | undefined }) {
  const lines = addressLines(address ?? null);
  return (
    <div className="flex flex-col gap-1">
      <Heading level={3} className="text-base font-semibold">
        {title}
      </Heading>
      {lines.length === 0 ? (
        <Text className="text-sm">Not given yet</Text>
      ) : (
        <address className="text-base not-italic">
          {lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </address>
      )}
    </div>
  );
}

export function CheckoutSessionDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const toast = useToast();
  const confirm = useConfirm();

  const { data, isPending, isError, error, refetch } = useCheckoutSession(id);
  const expire = useExpireCheckoutSession(id);

  useEffect(() => {
    ctx.setTitle('Checkout');
  }, [ctx]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="checkout"
        title="Could not load this checkout"
        description="This is a problem reaching the server. The session itself is unaffected — nothing has been changed or lost."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  if (!data) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={<CreditCard className="size-6" aria-hidden />}
            title="This checkout is no longer here"
            description="It may have been completed into an order or cleared away after timing out. Nothing is wrong — there is just nothing to show."
          />
        </div>
      </div>
    );
  }

  const session: CheckoutDetail = data;
  const state = checkoutState(session.step);
  const live = isCheckoutLive(session.step);
  const shopper = session.customerEmail ?? 'Guest shopper';
  const facts = [checkoutChannelLabel(session.channel), `Reached: ${stepLabel(session.step)}`];

  const onExpire = async () => {
    const ok = await confirm({
      title: 'End this checkout?',
      description:
        'This closes the stalled session and frees anything it is holding, such as reserved stock. ' +
        'The shopper would have to start again. It does not cancel their cart or contact them.',
      confirmLabel: 'End the checkout',
      cancelLabel: 'Leave it open',
      color: 'danger',
    });
    if (!ok) return;
    await deferTick();
    expire.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: 'Checkout ended', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not end this checkout',
          description: checkoutErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Checkout actions"
        status={
          <Text className="text-sm tabular-nums">
            {money(session.totals.totalCents, session.currency)}
          </Text>
        }
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            <div className="flex-1" />
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {shopper}
            </Heading>
            <Text className="text-sm">{facts.join(' · ')}</Text>
          </div>

          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>
                {state.detail}
                {live ? ` Held until ${formatDateTime(session.expiresAt)}.` : ''}
              </AlertDescription>
            </AlertContent>
          </Alert>

          <FormSection title="What they were buying">
            <div className="flex flex-col gap-1">
              <MoneyRow
                label="Items"
                cents={session.totals.subtotalCents}
                currency={session.currency}
              />
              {session.totals.discountTotalCents > 0 ? (
                <MoneyRow
                  label="Discount"
                  cents={-session.totals.discountTotalCents}
                  currency={session.currency}
                />
              ) : null}
              {session.totals.shippingTotalCents > 0 ? (
                <MoneyRow
                  label="Delivery"
                  cents={session.totals.shippingTotalCents}
                  currency={session.currency}
                />
              ) : null}
              {session.totals.surchargeTotalCents > 0 ? (
                <MoneyRow
                  label={session.surchargeLabel ?? 'Card fee'}
                  cents={session.totals.surchargeTotalCents}
                  currency={session.currency}
                />
              ) : null}
              {session.totals.taxTotalCents > 0 ? (
                <MoneyRow
                  label="Tax"
                  cents={session.totals.taxTotalCents}
                  currency={session.currency}
                />
              ) : null}
              {/* Money already paid, and already SUBTRACTED inside the total
                  below. Both were fetched here and drawn nowhere, so a checkout
                  part-paid by a gift card showed rows that came to more than the
                  total under them — the screen read as broken arithmetic rather
                  than as a card being spent. */}
              {session.totals.giftCardAppliedCents > 0 ? (
                <MoneyRow
                  label="Gift card"
                  cents={-session.totals.giftCardAppliedCents}
                  currency={session.currency}
                />
              ) : null}
              {session.totals.accountCreditAppliedCents > 0 ? (
                <MoneyRow
                  label="Credit on account"
                  cents={-session.totals.accountCreditAppliedCents}
                  currency={session.currency}
                />
              ) : null}
              <MoneyRow
                label="Total"
                cents={session.totals.totalCents}
                currency={session.currency}
                emphasis
              />
            </div>

            <Button
              size="sm"
              color="module"
              variant="soft"
              className="self-start"
              onClick={() => {
                ctx.open('commerce.cart.detail', { id: session.cartId }, { target: 'beside' });
              }}
            >
              <ShoppingCart className="size-4" aria-hidden />
              See the basket
            </Button>
          </FormSection>

          {(session.shippingDescription ?? session.paymentProviderSlug ?? session.poNumber) ? (
            <FormSection title="How they were paying and getting it">
              <div className="flex flex-col gap-1">
                {session.shippingDescription ? (
                  <Text className="text-base">Delivery: {session.shippingDescription}</Text>
                ) : null}
                {session.paymentProviderSlug ? (
                  <Text className="text-base">Paying by card ({session.paymentProviderSlug})</Text>
                ) : null}
                {session.poNumber ? (
                  <Text className="text-base">
                    On account · purchase order {session.poNumber}
                    {session.paymentTermsRequested ? ` · ${session.paymentTermsRequested}` : ''}
                  </Text>
                ) : null}
              </div>
            </FormSection>
          ) : null}

          {(session.customerEmail ?? session.shippingAddress ?? session.billingAddress) ? (
            <ModuleScope module="crm">
              <FormSection title="Who they are">
                <div className="flex flex-col gap-3">
                  {session.customerEmail ? (
                    <a
                      href={`mailto:${session.customerEmail}`}
                      className="link text-base break-all"
                    >
                      {session.customerEmail}
                    </a>
                  ) : null}
                  {(session.shippingAddress ?? session.billingAddress) ? (
                    <div className="grid gap-4 @md:grid-cols-2">
                      <AddressBlock title="Delivery address" address={session.shippingAddress} />
                      <AddressBlock title="Billing address" address={session.billingAddress} />
                    </div>
                  ) : null}
                </div>
              </FormSection>
            </ModuleScope>
          ) : null}

          {live ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Text className="text-base font-medium">End this checkout</Text>
                <Text className="text-sm">
                  Closes the stalled session and frees anything it is holding, such as reserved
                  stock. The shopper would have to start over. It does not contact them.
                </Text>
              </div>
              <Button
                size="sm"
                color="danger"
                variant="outline"
                loading={expire.isPending}
                onClick={() => {
                  void onExpire();
                }}
              >
                End checkout
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
