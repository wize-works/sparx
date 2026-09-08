'use client';

// One cart — what a shopper put together, and whether they went through with it.
//
// A cart is a TRANSACTION-in-waiting, not a draft you author, so this reads like
// the order pane: an identity heading (whose cart, from where), the state it is
// in, what is in it, and what it comes to. Nothing here is editable — a cart
// belongs to the shopper. The one staff move is recovering an abandoned cart,
// and it is offered only when the cart was actually abandoned.

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
import { ShoppingCart } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import { ModuleScope } from '../../components/module-scope';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { deferTick } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatMoney, formatDateTime } from './data';
import {
  cartChannelLabel,
  cartErrorMessage,
  cartShopperName,
  cartStateFrom,
  useCart,
  useRecoverCart,
  type CartDetail,
} from './carts-data';
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

export function CartDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const toast = useToast();
  const confirm = useConfirm();

  const { data, isPending, isError, error, refetch } = useCart(id);
  const recover = useRecoverCart(id);

  useEffect(() => {
    ctx.setTitle('Basket');
  }, [ctx]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="cart"
        title="Could not load this cart"
        description="This is a problem reaching the server. The cart itself is unaffected — nothing has been changed or lost."
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

  // The endpoint answers null for a cart that no longer exists (carts are swept
  // once past their hold). A dead link degrades to a clear message, never a
  // blank pane with a dead action beside it.
  if (!data) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            icon={<ShoppingCart className="size-6" aria-hidden />}
            title="This cart is no longer here"
            description="It may have been paid for and turned into an order, or cleared away after sitting untouched. Nothing is wrong — there is just nothing to show."
          />
        </div>
      </div>
    );
  }

  const cart: CartDetail = data;
  const state = cartStateFrom(cart);
  const shopper = cartShopperName(null, cart.customerName);
  const canRecover = Boolean(cart.abandonedAt) && !cart.recoveredAt;

  const facts = [cartChannelLabel(cart.channel), `${String(cart.items.length)} lines`];

  const onRecover = async () => {
    const ok = await confirm({
      title: 'Mark this cart as recovered?',
      description:
        `This records that ${shopper} came back to this cart. Use it when you have confirmed the ` +
        'sale went through another way — it does not charge anyone or send anything.',
      confirmLabel: 'Mark as recovered',
      cancelLabel: 'Leave it',
      color: 'module',
    });
    if (!ok) return;
    await deferTick();
    recover.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: 'Cart marked as recovered', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not mark this cart as recovered',
          description: cartErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Cart actions"
        status={
          <Text className="text-sm tabular-nums">
            {money(cart.totals.totalCents, cart.currency)}
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
              {shopper}’s basket
            </Heading>
            <Text className="text-sm">{facts.join(' · ')}</Text>
          </div>

          <Alert color={state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>
                {state.detail}
                {cart.abandonedAt ? ` Left ${formatDateTime(cart.abandonedAt)}.` : ''}
                {cart.recoveredAt ? ` Came back ${formatDateTime(cart.recoveredAt)}.` : ''}
              </AlertDescription>
            </AlertContent>
          </Alert>

          <FormSection title="What’s in it">
            {cart.items.length === 0 ? (
              <Text>This cart is empty — every line was removed before they left.</Text>
            ) : (
              <ul className="flex flex-col">
                {cart.items.map((item) => (
                  <li
                    key={item.cartItemId}
                    className="border-base-300 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-base font-medium">{item.name}</span>
                      <span className="font-mono text-sm break-all">{item.sku}</span>
                      <span className="text-sm">
                        {item.quantity} × {money(item.unitPriceCents, cart.currency)}
                      </span>
                    </div>
                    <span className="text-base font-medium tabular-nums">
                      {money(item.subtotalCents, cart.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-base-300 flex flex-col gap-1 border-t pt-3">
              <MoneyRow label="Items" cents={cart.totals.subtotalCents} currency={cart.currency} />
              {cart.totals.discountTotalCents > 0 ? (
                <MoneyRow
                  label="Discount"
                  cents={-cart.totals.discountTotalCents}
                  currency={cart.currency}
                />
              ) : null}
              {cart.totals.shippingTotalCents > 0 ? (
                <MoneyRow
                  label="Delivery"
                  cents={cart.totals.shippingTotalCents}
                  currency={cart.currency}
                />
              ) : null}
              {cart.totals.taxTotalCents > 0 ? (
                <MoneyRow label="Tax" cents={cart.totals.taxTotalCents} currency={cart.currency} />
              ) : null}
              <MoneyRow
                label="Cart total"
                cents={cart.totals.totalCents}
                currency={cart.currency}
                emphasis
              />
            </div>

            {cart.appliedDiscountCodes.length > 0 ? (
              <Text className="text-sm">Codes applied: {cart.appliedDiscountCodes.join(', ')}</Text>
            ) : null}
          </FormSection>

          {cart.customerName ? (
            <ModuleScope module="crm">
              <FormSection title="Whose cart it is">
                <Text className="text-base font-medium">{cart.customerName}</Text>
              </FormSection>
            </ModuleScope>
          ) : (
            <FormSection title="Whose cart it is">
              <Text className="text-base">
                A guest — this cart was filled by someone who was not signed in, so there is no
                account attached to it.
              </Text>
            </FormSection>
          )}

          {canRecover ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Text className="text-base font-medium">Mark this cart as recovered</Text>
                <Text className="text-sm">
                  Records that the shopper came back to it. It does not charge anyone or send any
                  email — it just updates the cart’s state for your reports.
                </Text>
              </div>
              <Button
                size="sm"
                color="module"
                variant="soft"
                loading={recover.isPending}
                onClick={() => {
                  void onRecover();
                }}
              >
                Mark recovered
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
