'use client';

// One supplier order — read-only, the record of what a supplier was asked to
// ship and where it got to.
//
// This is a transaction view, not an editor: it keeps an identity heading (which
// supplier, which of your orders) rather than an editable name field. The one
// thing you can DO here is recovery — re-route an order the supplier never
// received — which is a decision behind a confirm, not a form.
//
// It references YOUR commerce order, which is another module's data, so the link
// to it wears commerce's hue via a nested module scope — the house rule for a
// cross-module action.

import { useEffect, useMemo } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ExternalLink, RotateCcw, ShoppingBag, Truck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { ModuleScope } from '../../components/module-scope';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  dropshipErrorMessage,
  formatCents,
  orderState,
  useDropshipOrder,
  useRouteOrder,
  useSuppliers,
  type DropshipOrder,
} from './dropship-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-base-300 flex flex-wrap items-baseline justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <Text className="text-sm">{label}</Text>
      <Text as="span" className="font-medium">
        {children}
      </Text>
    </div>
  );
}

export function DropshipOrderDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const { data: order, isPending, isError, error, refetch } = useDropshipOrder(id);
  const suppliers = useSuppliers();
  const toast = useToast();
  const confirm = useConfirm();
  const route = useRouteOrder();

  const supplierName = useMemo(() => {
    const found = suppliers.data?.items.find((s) => s.id === order?.supplierId);
    return found?.name ?? null;
  }, [suppliers.data, order]);

  useEffect(() => {
    if (order) ctx.setTitle(supplierName ? `${supplierName} order` : 'Supplier order');
  }, [ctx, order, supplierName]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="supplier order"
        title="Could not load this supplier order"
        description="This is a problem reaching the server, or the order no longer exists. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !order) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  const state = orderState(order.status);
  const canReroute = order.status === 'failed' || order.status === 'pending';

  const onReroute = async () => {
    const ok = await confirm({
      title: 'Try routing this order again?',
      description:
        'This asks the system to route the customer order to its suppliers again. Use it when a supplier never received the order or it failed to send. It is safe to run more than once — an order that already reached the supplier is not sent twice.',
      confirmLabel: 'Route it again',
      cancelLabel: 'Cancel',
      color: 'warning',
    });
    if (!ok) return;
    route.mutate(order.orderId, {
      onSuccess: () => {
        toast.add({
          title: 'Routing again',
          description:
            'The order is being sent to its suppliers. Refresh in a moment to see it move.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not route it again',
          description: dropshipErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Supplier order actions"
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {order.trackingUrl ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                className="ml-auto shrink-0"
                // Children arrive via silica's `render` composition; the a11y rule
                // reads the source anchor and cannot see them.
                // eslint-disable-next-line jsx-a11y/anchor-has-content -- children arrive via `render`
                render={<a href={order.trackingUrl} target="_blank" rel="noreferrer" />}
              >
                <Truck className="size-4" aria-hidden />
                Track parcel
                <ExternalLink className="size-3" aria-hidden />
              </Button>
            ) : null}
            {/* Cross-module: this opens the customer's commerce order, so it wears
            commerce's hue. */}
            <ModuleScope
              module="commerce"
              className={order.trackingUrl ? 'shrink-0' : 'ml-auto shrink-0'}
            >
              <Button
                size="sm"
                variant="outline"
                color="module"
                onClick={(event) => {
                  ctx.open(
                    'commerce.order.detail',
                    { id: order.orderId },
                    { target: targetFor(event) }
                  );
                }}
              >
                <ShoppingBag className="size-4" aria-hidden />
                Customer order
              </Button>
            </ModuleScope>
            {canReroute ? (
              <Button
                size="sm"
                color="module"
                className="shrink-0"
                loading={route.isPending}
                onClick={() => {
                  void onReroute();
                }}
              >
                <RotateCcw className="size-4" aria-hidden />
                Route again
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* Identity: this is a read-only transaction, so it leads with a real
              heading saying WHAT it is. */}
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {supplierName ? `Order to ${supplierName}` : 'Supplier order'}
            </Heading>
            <Text className="text-sm">
              Placed <Timestamp value={order.createdAt} format="relative" />
              {order.supplierOrderId ? ` · Supplier reference ${order.supplierOrderId}` : ''}
            </Text>
          </div>

          {/* ONE status message — the failure text when there is one (it names the
              exact problem), otherwise the plain description of the state. */}
          <Alert color={order.status === 'failed' ? 'error' : state.tone} variant="soft">
            <AlertContent>
              <AlertTitle>{state.label}</AlertTitle>
              <AlertDescription>{order.errorMessage ?? state.detail}</AlertDescription>
            </AlertContent>
          </Alert>

          <FormSection title="What the supplier is shipping">
            <LineItems order={order} />
          </FormSection>

          <FormSection title="Progress">
            <div className="flex flex-col gap-3">
              <FactRow label="Reached the supplier">
                <Timestamp value={order.createdAt} format="absolute" />
              </FactRow>
              <FactRow label="Sent to the supplier">
                {order.submittedAt ? (
                  <Timestamp value={order.submittedAt} format="absolute" />
                ) : (
                  <Text as="span" className="text-sm">
                    Not yet
                  </Text>
                )}
              </FactRow>
              <FactRow label="Shipped">
                {order.shippedAt ? (
                  <Timestamp value={order.shippedAt} format="absolute" />
                ) : (
                  <Text as="span" className="text-sm">
                    Not yet
                  </Text>
                )}
              </FactRow>
              <FactRow label="Delivered">
                {order.deliveredAt ? (
                  <Timestamp value={order.deliveredAt} format="absolute" />
                ) : (
                  <Text as="span" className="text-sm">
                    Not yet
                  </Text>
                )}
              </FactRow>
              {order.trackingNumber ? (
                <FactRow label="Tracking number">
                  <span className="font-mono">{order.trackingNumber}</span>
                </FactRow>
              ) : null}
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function LineItems({ order }: { order: DropshipOrder }) {
  if (order.lineItems.length === 0) {
    return <Text className="text-sm">No item details were recorded for this order.</Text>;
  }
  return (
    <div className="flex flex-col">
      {order.lineItems.map((li, index) => {
        const sku = typeof li.sku === 'string' ? li.sku : `Item ${String(index + 1)}`;
        const qty = typeof li.quantity === 'number' ? li.quantity : null;
        const unit = typeof li.unitPriceCents === 'number' ? li.unitPriceCents : null;
        return (
          <div
            key={`${sku}:${String(index)}`}
            className="border-base-300 flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{sku}</span>
            {qty !== null ? (
              <Text as="span" className="shrink-0 text-sm">
                {qty === 1 ? '1 unit' : `${String(qty)} units`}
              </Text>
            ) : null}
            {unit !== null ? (
              <Text as="span" className="shrink-0 text-sm font-medium tabular-nums">
                {formatCents(unit)} each
              </Text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
