'use client';

// Subscriptions — who buys this product on a repeating schedule.
//
// ── The common case is "nobody", and getting that right IS the design ────
//
// Almost every product is bought once. On one of those, this pane must read as a
// complete answer rather than an empty table with a broken feature behind it —
// so there are three genuinely different "nothing here" states and they say
// three different things:
//
//   not set up for repeat  → "People buy this one at a time." Plus what setting
//                            it up would mean. Nothing is wrong.
//   set up, nobody yet     → "Ready to be bought on repeat, nobody has." This is
//                            the one worth acting on, and it is invisible if you
//                            collapse it into the case above.
//   set up, people had     → counts include the ones who STOPPED, because "four
//                            people cancelled last month" is the single most
//                            useful thing this screen can tell anyone.
//
// ── Why this pane is read-only ───────────────────────────────────────────
//
// Every verb on a subscription — pause, skip, change the address, cancel —
// belongs to a CUSTOMER's subscription, not to a product. Offering "cancel" here
// would mean cancelling one person's whole standing order from a screen about a
// product they happen to buy, with none of the context that decision needs. So
// this pane reports, and hands off to the subscription itself.
//
// ── The money is this product's share, not the whole subscription's ──────
//
// A $200/month box containing one $5 item is $5 of THIS product's recurring
// revenue. The service does that split; the pane says which number it is showing,
// because an unlabelled MRR figure on a product page will be read as the product's
// and quoted at someone.

import { Badge, Button, EmptyState, Heading, Text, Timestamp } from '@wizeworks/silicaui-react';
import { CalendarClock, Repeat2, ServerCrash, ShoppingBag } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { FollowingNotice, ProductScopeFallback, useProductScope } from './product-scope';
import {
  formatCents,
  productErrorMessage,
  subscriptionState,
  useProductSubscriptions,
  type Product,
  type ProductSubscriber,
  type ProductSubscriptions,
} from './products-data';

const LABEL = 'Subscriptions';

/** A headline number with the sentence that stops it being misread. Not a Stat
 *  block: three of those side by side in a pane docked at 320px collapse into an
 *  unreadable column of large numbers with no room for the caption that makes
 *  each one mean something. */
function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Text as="span" className="text-2xl font-semibold">
        {value}
      </Text>
      <Text className="text-sm">{label}</Text>
    </div>
  );
}

function SubscriberRow({ subscriber }: { subscriber: ProductSubscriber }) {
  const state = subscriptionState(subscriber.status);
  const quantity = subscriber.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="border-base-300 flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text as="span" className="font-medium">
          {subscriber.customerName ?? 'A customer'}
        </Text>
        <Text className="text-sm">
          {quantity === 1 ? '1 of this' : `${String(quantity)} of this`} each time
          {subscriber.itemCount > subscriber.lines.length
            ? `, alongside ${String(subscriber.itemCount - subscriber.lines.length)} other ${subscriber.itemCount - subscriber.lines.length === 1 ? 'product' : 'products'}`
            : ''}
        </Text>
        <Text className="text-sm">
          {subscriber.nextOccurrenceAt ? (
            <>
              Next delivery <Timestamp value={subscriber.nextOccurrenceAt} format="relative" />
            </>
          ) : (
            'No further deliveries scheduled.'
          )}
        </Text>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
        <Text as="span" className="font-medium">
          {formatCents(subscriber.monthlyRecurringRevenueCents, subscriber.currency)} a month
        </Text>
      </div>
    </div>
  );
}

function SubscriptionsBody({ product, data }: { product: Product; data: ProductSubscriptions }) {
  const setUpForRepeat = data.fulfillmentType === 'subscription';
  const everSubscribed = data.subscriptions.length > 0;
  const live = data.counts.active + data.counts.paused + data.counts.pastDue;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Heading level={1} className="text-2xl font-semibold">
          {product.title}
        </Heading>
        <Text className="text-sm">
          {everSubscribed
            ? 'People who have this delivered again and again, rather than buying it once.'
            : 'Whether anyone has this delivered on a repeating schedule.'}
        </Text>
      </div>

      {/* NOT set up for repeat and nobody subscribes — the ordinary case. It
          gets a real answer, not an empty list. */}
      {!setUpForRepeat && !everSubscribed ? (
        <FormSection title="How people buy this">
          <EmptyState
            size="sm"
            icon={<ShoppingBag className="size-6" aria-hidden />}
            title="People buy this one at a time"
            description={`${product.title} is a normal one-off purchase — someone buys it, you send it, and that is the end of it. Nothing is missing here.`}
          />
          <Text className="text-sm">
            If you wanted it delivered on a schedule instead — every month, every quarter — you
            would set that up on the product itself by changing how it is fulfilled. Customers would
            then choose a delivery frequency at checkout, and every repeat order would appear on
            this panel.
          </Text>
        </FormSection>
      ) : null}

      {setUpForRepeat && !everSubscribed ? (
        <FormSection title="How people buy this">
          <EmptyState
            size="sm"
            icon={<CalendarClock className="size-6" aria-hidden />}
            title="Ready for repeat orders, but nobody has started one"
            description={`${product.title} is set up to be delivered on a schedule, and customers can choose that at checkout. Nobody has yet.`}
          />
          <Text className="text-sm">
            If this has been on sale a while, it is worth checking that the repeat option is
            actually visible on the product&apos;s page and that the price for subscribing is
            attractive next to buying it once.
          </Text>
        </FormSection>
      ) : null}

      {everSubscribed ? (
        <>
          <FormSection
            title="What repeat orders are worth"
            description="This product's share only — a subscription box holding other products counts here for this product's part of it."
          >
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <Figure
                value={formatCents(data.monthlyRecurringRevenueCents, data.currency ?? 'USD')}
                label="every month, from repeat orders that are still running"
              />
              <Figure
                value={String(data.unitsPerMonth)}
                label="of these you are committed to sending each month"
              />
              <Figure
                value={String(data.counts.active)}
                label={
                  data.counts.active === 1
                    ? 'customer has it on repeat right now'
                    : 'customers have it on repeat right now'
                }
              />
            </div>

            {data.counts.pastDue > 0 ? (
              <Text className="text-sm">
                {data.counts.pastDue === 1
                  ? '1 repeat order could not be paid for. It stops delivering until the payment goes through, so it is worth chasing.'
                  : `${String(data.counts.pastDue)} repeat orders could not be paid for. They stop delivering until the payments go through, so they are worth chasing.`}
              </Text>
            ) : null}

            {data.counts.cancelled > 0 ? (
              <Text className="text-sm">
                {data.counts.cancelled === 1
                  ? '1 customer has stopped their repeat order for this.'
                  : `${String(data.counts.cancelled)} customers have stopped their repeat orders for this.`}{' '}
                {live === 0
                  ? 'Nobody has it on repeat any more.'
                  : 'They are listed below with the rest.'}
              </Text>
            ) : null}
          </FormSection>

          <FormSection
            title="Who has it on repeat"
            description="To pause, change or stop one of these, open that customer's repeat order — it belongs to them, not to this product."
          >
            <div className="flex flex-col gap-3">
              {data.subscriptions.map((subscriber) => (
                <SubscriberRow key={subscriber.id} subscriber={subscriber} />
              ))}
            </div>
          </FormSection>
        </>
      ) : null}
    </>
  );
}

export function ProductSubscriptionsSurface({ ctx }: { ctx: SurfaceContext }) {
  const scope = useProductScope(ctx, { label: LABEL });
  const productId = scope.productId ?? 'new';
  const subscriptions = useProductSubscriptions(productId);

  if (scope.state !== 'ready') {
    return <ProductScopeFallback ctx={ctx} scope={scope} label={LABEL} />;
  }

  const data = subscriptions.data;
  const active = data?.counts.active ?? 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={`${LABEL} actions`}
        controls={
          <>
            <Repeat2 className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {scope.product.title}
            </Heading>
            {scope.isFollowing ? (
              <Badge color="info" variant="soft" size="sm">
                Following
              </Badge>
            ) : null}
            {active > 0 ? (
              <Badge color="success" variant="soft" size="sm">
                {active === 1 ? '1 on repeat' : `${String(active)} on repeat`}
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={subscriptions.isFetching}
            updatedAt={subscriptions.dataUpdatedAt}
            onRefresh={() => {
              void subscriptions.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <FollowingNotice scope={scope} />

          {subscriptions.isError ? (
            <EmptyState
              icon={<ServerCrash className="size-6" aria-hidden />}
              title="Could not load repeat orders"
              description={productErrorMessage(
                subscriptions.error,
                'This is a problem reaching the server. Nobody’s repeat order has changed.'
              )}
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void subscriptions.refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : data === undefined ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : (
            <SubscriptionsBody product={scope.product} data={data} />
          )}
        </div>
      </div>
    </div>
  );
}
