'use client';

// One order — what was bought, what was paid, where it went.
//
// This is a TRANSACTION detail: a record of something that already happened, so
// it keeps a real identity heading (the order number and who placed it) rather
// than opening with an editable name field. Nothing here is a draft, so there is
// nothing to save and no dirty state to guard.
//
// Deliberately NOT built on EditorLayout. That chassis is a form with a
// completion order and a running summary rail beside it; this pane is a
// narrative — items, then money, then who, then where, then what happened to it.
// A rail would repeat the totals that are already the loudest thing on screen.
// So: one centred column, capped, because a pane torn onto a second monitor is
// otherwise 2000px of grey with the line items pinned to the left edge.
//
// The audience owns a business, not a warehouse system. "Fulfilled" means "on
// the way" here, "captured" means "taken", and a payment processor's vocabulary
// never reaches the screen untranslated.

import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Input,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ExternalLink, Ban, Route, Undo2 } from 'lucide-react';
import { useGeneratePickList, pickErrorMessage } from '../inventory/picking-data';
import { FormSection } from '../../components/form-section';
import { ModuleScope } from '../../components/module-scope';
import { deferTick } from '../../lib/defer';
import { useSites, useModuleStates, useViewer } from '../../lib/api/shell-data';
import { SoldBySection } from './sold-by-section';
import { RecordPayment } from './record-payment';
import { RecordHandover } from './record-handover';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import {
  addressLines,
  amountDue,
  channelLabel,
  customerName,
  deliveryPlan,
  formatDate,
  formatDateTime,
  formatMoney,
  fulfillmentTone,
  orderErrorMessage,
  paymentRecordTone,
  paymentState,
  refundTone,
  shipmentHeadline,
  shipmentStatusLabel,
  shippingState,
  useCancelOrder,
  useOrder,
  useOrderFulfillments,
  useOrderPayments,
  useOrderRefunds,
  useRefundOrder,
  useCreateInvoiceForOrder,
  useOrderInvoices,
  useUpdateTracking,
  PAYMENT_PROCESSOR_LABELS,
  PAYMENT_STATUS_LABELS,
  paidByHand,
  REFUND_STATUS_LABELS,
  type Order,
  type OrderAddress,
  type OrderInvoice,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

/** The one column everything sits in. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** A money line in the totals block. `emphasis` is the order's own total and the
 *  amount still owed — the two numbers anyone opens this pane for. */

function MoneyRow({
  label,
  amount,
  currency,
  emphasis = false,
}: {
  label: string;
  amount: number;
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
      <span className="tabular-nums">{formatMoney(amount, currency)}</span>
    </div>
  );
}

function AddressBlock({ title, address }: { title: string; address: OrderAddress | null }) {
  const lines = addressLines(address);
  return (
    <div className="flex flex-col gap-1">
      <Heading level={3} className="text-base font-semibold">
        {title}
      </Heading>
      {lines.length === 0 ? (
        <Text className="text-sm">Not given</Text>
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

/** A section whose data comes from its own request, so it reports its own
 *  loading and its own failure. One bad subresource must not blank out the rest
 *  of the order. */
function SubSection({
  title,
  description,
  isPending,
  isError,
  errorText,
  emptyText,
  count,
  children,
  footer,
}: {
  title: string;
  description?: string;
  isPending: boolean;
  isError: boolean;
  errorText: string;
  emptyText: string;
  count: number;
  children: React.ReactNode;
  /** Rendered under the list AND under the empty text, because the thing that
   *  ADDS the first row must be reachable when there are no rows — which is
   *  exactly the state it exists for. `children` alone could not do this: it
   *  is hidden at count 0. */
  footer?: React.ReactNode;
}) {
  return (
    <FormSection title={title} description={description}>
      {isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : isError ? (
        <Text className="text-sm">{errorText}</Text>
      ) : count === 0 ? (
        <Text>{emptyText}</Text>
      ) : (
        children
      )}
      {!isPending && !isError ? footer : null}
    </FormSection>
  );
}

/**
 * Asking the customer for the money.
 *
 * A shop with no payment provider takes none at checkout — its last screen says
 * so, in as many words: "Placing this order does not take any money now. We'll
 * be in touch about paying for it." The goods then go out and the shop has to be
 * in touch. This is where it is.
 *
 * Before this existed the owner could raise an invoice, but only by opening the
 * order, reading the items, going to the Invoices screen, finding the customer
 * again and retyping every line by hand — and when the customer paid it, this
 * order still read "Not paid", because nothing joined the two.
 */
function invoiceState(invoice: OrderInvoice): { label: string; tone: string } {
  if (invoice.status === 'paid') return { label: 'Paid', tone: 'success' };
  if (invoice.status === 'void') return { label: 'Cancelled', tone: 'warning' };
  if (invoice.status === 'overdue') return { label: 'Late', tone: 'danger' };
  if (invoice.status === 'partial') return { label: 'Part paid', tone: 'info' };
  return { label: 'Waiting to be paid', tone: 'warning' };
}

/** Why there is nothing to ask for, when there is nothing to ask for — the same
 *  refusals the server makes, said here so the button is simply absent rather
 *  than present and guaranteed to fail. A control whose only job is to return an
 *  error is worse than no control. */
function reasonNotToAsk(order: Order): string | null {
  if (order.status === 'cancelled') {
    return 'This order was cancelled, so there is nothing to ask for.';
  }
  if (order.status === 'refunded') {
    return 'This order was refunded, so there is nothing to ask for.';
  }
  if (order.total - order.amountPaid <= 0) return 'This order is paid in full.';
  return null;
}

function OrderInvoicesSection({ order, ctx }: { order: Order; ctx: SurfaceContext }) {
  const invoices = useOrderInvoices(order.id);
  const create = useCreateInvoiceForOrder(order.id);
  const toast = useToast();

  const rows = invoices.data ?? [];
  const blocked = reasonNotToAsk(order);
  const alreadyAsked = rows.some((i) => i.status !== 'void');

  return (
    <SubSection
      title="Asking for payment"
      description="The invoices you have raised for this order, whether they went out, and what has come back."
      isPending={invoices.isPending}
      isError={invoices.isError}
      errorText="We could not load the invoices just now. Anything already sent is unaffected — try reopening this order in a moment."
      emptyText={blocked ?? 'You have not asked for the money on this order yet.'}
      count={rows.length}
      footer={
        blocked || alreadyAsked ? null : (
          <div className="border-base-300 mt-4 border-t pt-4">
            <Button
              color="primary"
              size="sm"
              disabled={create.isPending}
              onClick={() => {
                create.mutate(
                  {},
                  {
                    onSuccess: (result) => {
                      toast.add({
                        title: result.document.number
                          ? `Invoice ${result.document.number} raised`
                          : 'Invoice raised',
                        description:
                          'Every line came across from this order. Open it to set a deadline and send it.',
                        type: 'success',
                      });
                      ctx.open('invoicing.invoice.edit', { id: result.document.id });
                    },
                    onError: (error) => {
                      toast.add({
                        title: 'Could not raise the invoice',
                        description: orderErrorMessage(
                          error,
                          'Nothing changed on this order. Try again in a moment.'
                        ),
                        type: 'error',
                      });
                    },
                  }
                );
              }}
            >
              Make an invoice
            </Button>
            <Text className="mt-2 text-sm">
              Copies every line, the delivery charge and the tax from this order, so nothing has to
              be typed twice. Money already in comes across too.
            </Text>
          </div>
        )
      }
    >
      <ul className="flex flex-col">
        {rows.map((invoice) => {
          const state = invoiceState(invoice);
          return (
            <li
              key={invoice.id}
              className="border-base-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <Button
                  variant="link"
                  size="sm"
                  className="self-start px-0 font-mono text-base"
                  onClick={() => {
                    ctx.open('invoicing.invoice.edit', { id: invoice.id });
                  }}
                >
                  {invoice.number ?? 'Not numbered yet'}
                </Button>
                <span className="text-sm">
                  {formatMoney(invoice.total, invoice.currency)} asked for
                  {invoice.amountPaid > 0
                    ? ` · ${formatMoney(invoice.amountPaid, invoice.currency)} in`
                    : ''}
                </span>
                {/* Whether the customer actually has it. Raising an invoice and
                    emailing it are two acts, and this line used to print "Sent"
                    off the date the document was CREATED — telling the owner her
                    customer had a bill that had never left the building. */}
                {/* `break-words` because the address is one unbreakable token: at
                    360px a long one paints past this box with nothing for the
                    browser to wrap at. Ordinary words still break at spaces. */}
                <span className="text-sm break-words">
                  {invoice.sentAt
                    ? `Sent ${formatDate(invoice.sentAt)}${invoice.sentTo ? ` to ${invoice.sentTo}` : ''}`
                    : 'Not sent yet · open it to email it'}
                </span>
                {/* The due date is the whole reason an invoice counts as late, so
                    it says when there is one and says there is none when there is
                    not — rather than leaving a blank to interpret. */}
                <span className="text-sm">
                  {invoice.dueAt ? `Due ${formatDate(invoice.dueAt)}` : 'No deadline set'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {invoice.balance > 0 ? (
                  <span className="font-medium tabular-nums">
                    {formatMoney(invoice.balance, invoice.currency)} still owed
                  </span>
                ) : null}
                <Badge color={state.tone} variant="soft" size="sm">
                  {state.label}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </SubSection>
  );
}

/**
 * Putting a tracking number on after the parcel has gone.
 *
 * The number is optional at the counter and, for a shop that posts its own
 * parcels, usually not known yet — the goods are boxed and marked sent, and the
 * number comes back from the post office afterwards. Until now there was nowhere
 * to put it: the shipment record was frozen the moment it was made, and the
 * customer had already been emailed "on its way" with nothing to follow.
 *
 * A collection has nothing to track, so it gets no form.
 */
function TrackingEditor({
  orderId,
  shipment,
}: {
  orderId: string;
  shipment: { id: string; carrier: string | null; trackingNumber: string | null };
}) {
  const update = useUpdateTracking(orderId);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(shipment.trackingNumber ?? '');

  if (shipment.carrier === 'pickup') return null;

  if (!open) {
    return (
      <Button
        variant="link"
        size="sm"
        className="self-start px-0"
        onClick={() => {
          setValue(shipment.trackingNumber ?? '');
          setOpen(true);
        }}
      >
        {shipment.trackingNumber ? 'Change the tracking number' : 'Add a tracking number'}
      </Button>
    );
  }

  return (
    <form
      className="mt-1 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(
          { fulfillmentId: shipment.id, trackingNumber: value },
          {
            onSuccess: () => {
              setOpen(false);
              toast.add({
                title: value.trim() ? 'Tracking number saved' : 'Tracking number removed',
                description: value.trim()
                  ? 'It shows on the customer’s order page.'
                  : 'The customer’s order page no longer shows one.',
                type: 'success',
              });
            },
            onError: (error) => {
              toast.add({
                title: 'Could not save the tracking number',
                description: orderErrorMessage(
                  error,
                  'Nothing changed on this delivery. Try again in a moment.'
                ),
                type: 'error',
              });
            },
          }
        );
      }}
    >
      {/* A width, so the box does not take the whole row and push Save onto a
          line of its own. A placeholder, because "Add a tracking number" is on
          the button that opened this and an empty box under a despatch date
          otherwise says nothing about what belongs in it. Kept short: the field
          is monospaced, so a longer hint is clipped rather than read. */}
      <Input
        aria-label="Tracking number"
        placeholder="Tracking number"
        value={value}
        size="sm"
        className="w-56 max-w-full font-mono"
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <Button type="submit" color="primary" size="sm" disabled={update.isPending}>
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen(false);
        }}
      >
        Cancel
      </Button>
    </form>
  );
}

function OrderIdentity({ order, siteName }: { order: Order; siteName: string | null }) {
  const facts = [
    `Placed ${formatDate(order.placedAt)}`,
    channelLabel(order),
    ...(siteName ? [siteName] : []),
  ];
  return (
    <div className="flex flex-col gap-1">
      {/* The order number IS this pane's identity, and it is read-only — so it
          gets a real heading, with the buyer beneath it. Anyone arriving from a
          list needs to know they opened the right sale before anything else. */}
      <Heading level={1} className="text-2xl font-semibold">
        Order {order.orderNumber}
      </Heading>
      <Text className="text-lg">{customerName(order.customer)}</Text>
      <Text className="text-sm">{facts.join(' · ')}</Text>
    </div>
  );
}

export function OrderDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const toast = useToast();
  const confirm = useConfirm();

  const { data: order, isPending, isError, error, refetch } = useOrder(id);
  const { data: sites } = useSites();
  const payments = useOrderPayments(id);
  const fulfillments = useOrderFulfillments(id);
  const refunds = useOrderRefunds(id);
  const cancel = useCancelOrder(id);
  const refund = useRefundOrder(id);
  const generateWalk = useGeneratePickList();

  // "Who sold it" needs BOTH: the staff module on (otherwise there is no roster
  // to credit) and pay access (every /v1/staff/sales/* route is admin-only —
  // pay is the one place the viewer/editor ladder is deliberately wrong).
  const viewer = useViewer();
  const modules = useModuleStates();
  const canSeeCommission =
    (modules.data?.some((m) => m.slug === 'staff' && m.enabled) ?? false) &&
    (viewer.data?.role === 'admin' || viewer.data?.role === 'owner');

  // Keyed on the NUMBER, not the order object. Depending on the object retitles
  // the tab on every refetch — including the one that follows a cancellation,
  // which pushes a dockview title update out of a commit for no gain, since the
  // title it sets is the one already there.
  const orderNumber = order?.orderNumber ?? null;
  useEffect(() => {
    if (orderNumber) ctx.setTitle(`Order ${orderNumber}`);
  }, [ctx, orderNumber]);

  // A failed load REPLACES the pane. Rendering an empty order beside a live
  // Cancel button offers a move against something that isn't there.
  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="order"
        title="Could not load this order"
        description="This is a problem reaching the server. The order itself is unaffected — nothing has been changed or lost."
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

  const paid = paymentState(order);
  const shipped = shippingState(order);
  const due = amountDue(order);
  // Whether a refund has anywhere to go. Money the business took by hand never
  // passed through a gateway, so "back to the card it was paid with" is a
  // promise about a card that does not exist — she hands the notes back.
  const refundGoesBackToACard = !(payments.data ?? []).some((payment) =>
    paidByHand(payment.processor)
  );
  const items = order.items ?? [];
  const currency = order.currency;
  const site = sites?.find((candidate) => candidate.id === order.propertyId);

  // Cancelling is refused by the server on an order that has already arrived or
  // been refunded, so the control simply isn't offered there — a button that
  // exists to hand back an error is worse than no button.
  const cancellable =
    order.status !== 'cancelled' && order.status !== 'delivered' && order.status !== 'refunded';

  // Whether the warehouse has anything left to fetch. Same test the pick-list
  // generator applies server-side, so the button and the endpoint agree about
  // when there is work — a button that exists only to hand back "nothing to
  // pick" is worse than no button.
  const stillToFulfil =
    cancellable && items.some((item) => item.quantity - item.quantityFulfilled > 0);

  // How this order leaves, as the shopper chose it. Everything about the bottom
  // half of this pane turns on it: a customer coming to collect has no carrier,
  // no tracking number, and no warehouse walk that means anything.
  const plan = deliveryPlan(order);

  // What is still refundable: money actually taken, less anything already given
  // back. Rounded to cents so floating-point noise can't offer a $0.0000001 refund.
  const refundableAmount = Math.max(
    0,
    Math.round((Number(order.amountPaid) - Number(order.refundTotal ?? 0)) * 100) / 100
  );

  const onRefund = async () => {
    const ok = await confirm({
      title: `Refund ${formatMoney(refundableAmount, currency)} to ${customerName(order.customer)}?`,
      description:
        `This sends ${formatMoney(refundableAmount, currency)} back to the card used for order ` +
        `${order.orderNumber}. The money leaves your account straight away and this cannot be ` +
        `undone. Stock is NOT taken back in — if you expect the items returned, process a return ` +
        `instead so the goods come back on the shelf.`,
      confirmLabel: `Refund ${formatMoney(refundableAmount, currency)}`,
      cancelLabel: 'Leave it as it is',
      color: 'danger',
    });
    if (!ok) return;
    // Same reason as onCancel: let the confirm's flushSync close commit finish
    // before this pane re-renders underneath it.
    await deferTick();
    refund.mutate(
      { amount: refundableAmount },
      {
        onSuccess: () => {
          toast.add({
            title: `Refunded ${formatMoney(refundableAmount, currency)}`,
            description: `Order ${order.orderNumber} — the customer's card has been credited.`,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not refund this order',
            description: orderErrorMessage(
              error,
              'No money was moved and nothing was changed on the order.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  const onCancel = async () => {
    const ok = await confirm({
      title: `Cancel order ${order.orderNumber}?`,
      description:
        `This marks the order as cancelled for ${customerName(order.customer)} — ` +
        `${String(items.length)} ${items.length === 1 ? 'item' : 'items'} worth ` +
        `${formatMoney(order.total, currency)} will no longer be sent. ` +
        (order.amountPaid > 0
          ? `${formatMoney(order.amountPaid, currency)} has already been paid and is NOT refunded by this — you refund that separately.`
          : 'No money has come in, so there is nothing to refund.') +
        ' A cancelled order cannot be reopened.',
      confirmLabel: 'Cancel the order',
      cancelLabel: 'Leave it as it is',
      color: 'danger',
    });
    if (!ok) return;
    // Yield before mutating, so the confirm's own close commit (Base UI closes
    // by measuring with flushSync) is finished before this pane starts
    // re-rendering underneath it. Same reason lifecycle.tsx yields around its
    // stage dialog — see lib/defer.ts.
    await deferTick();
    cancel.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: `Order ${order.orderNumber} cancelled`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not cancel this order',
          description: orderErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      {/* Lifecycle in the pane header: the two states this order is actually in,
          side by side, always visible while the body scrolls. */}
      <PaneToolbar
        label="Order actions"
        status={<Text className="text-sm tabular-nums">{formatMoney(order.total, currency)}</Text>}
        controls={
          <>
            <Badge color={paid.tone} variant="soft" size="sm">
              {paid.label}
            </Badge>
            {/* A refunded order carries the same word on both axes, and two
            identical badges side by side read as a rendering fault rather than
            as two facts. */}
            {shipped.label === paid.label ? null : (
              <Badge color={shipped.tone} variant="soft" size="sm">
                {shipped.label}
              </Badge>
            )}
            <div className="flex-1" />
            {/* Send it to the warehouse (docs/146 Phase 4). Only while there is
            something left to send: an order already fulfilled has nothing to
            fetch, and offering the button anyway produces a walk that generates
            zero lines and an error nobody expected.
            And only for something being SENT. A picking walk for an order the
            customer is coming to collect routes the shop's own counter staff
            through a warehouse they do not have; the handover control at the
            foot of the pane is what finishes that order.
            Wears the INVENTORY hue on a commerce pane, deliberately — it is a
            warehouse action surfacing here, and color follows functionality
            rather than the page it happens to be on. */}
            {stillToFulfil && !plan.collected ? (
              <Button
                size="sm"
                color="module-inventory"
                variant="outline"
                disabled={generateWalk.isPending}
                onClick={() => {
                  void (async () => {
                    try {
                      const walk = await generateWalk.mutateAsync({ orderIds: [order.id] });
                      toast.add({
                        title: `Walk ${walk.number} ready`,
                        description: `${String(walk.lineCount)} to fetch at ${walk.warehouseName}.`,
                        type: 'success',
                      });
                      ctx.open('inventory.picking.detail', { id: walk.id }, { target: 'beside' });
                    } catch (error) {
                      toast.add({
                        title: 'Could not create a walk',
                        description: pickErrorMessage(
                          error,
                          'Nothing was changed. Check the order still has something to send.'
                        ),
                        type: 'error',
                      });
                    }
                  })();
                }}
              >
                <Route className="size-4" aria-hidden />
                Send to the warehouse
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className={COLUMN}>
          <OrderIdentity order={order} siteName={site?.name ?? null} />

          {/* ONE message, the most specific true one. A cancelled order says why
              it was cancelled; otherwise money owed is the thing worth saying,
              and an order that is paid and delivered says nothing at all — the
              badges above already carry it. */}
          {order.status === 'cancelled' || order.status === 'refunded' ? (
            <Alert color={shipped.tone} variant="soft">
              <AlertContent>
                <AlertTitle>{shipped.label}</AlertTitle>
                <AlertDescription>
                  {shipped.detail}
                  {order.cancelledAt ? ` (${formatDateTime(order.cancelledAt)})` : ''}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : due > 0 ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>{formatMoney(due, currency)} still owed</AlertTitle>
                <AlertDescription>
                  {order.amountPaid > 0
                    ? `${formatMoney(order.amountPaid, currency)} of ${formatMoney(order.total, currency)} has come in so far.`
                    : 'No money has come in for this order yet.'}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {/* What they bought, then what it came to. One card, because the
              totals are the sum of the rows directly above them — splitting them
              apart makes the reader carry a number across a gap. */}
          <FormSection title="What they bought">
            {items.length === 0 ? (
              <Text>This order has no items on it, which usually means it was imported.</Text>
            ) : (
              <ul className="flex flex-col">
                {items.map((item) => {
                  const partlySent =
                    item.quantityFulfilled > 0 && item.quantityFulfilled < item.quantity;
                  return (
                    <li
                      key={item.id}
                      className="border-base-300 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-base font-medium">{item.name}</span>
                        <span className="font-mono text-sm break-all">{item.sku}</span>
                        <span className="text-sm">
                          {item.quantity} × {formatMoney(item.unitPrice, currency)}
                          {item.discountAmount > 0
                            ? ` · ${formatMoney(item.discountAmount, currency)} off`
                            : ''}
                        </span>
                        {partlySent ? (
                          <span className="text-sm">
                            {item.quantityFulfilled} of {item.quantity} sent so far
                          </span>
                        ) : null}
                        {item.quantityRefunded > 0 ? (
                          <span className="text-sm">{item.quantityRefunded} refunded</span>
                        ) : null}
                      </div>
                      {/* Quantity × price, NOT the stored `lineTotal` — that one
                          folds the line's own tax in, while the totals block
                          below charges tax and discount as their own lines. Show
                          lineTotal and the column visibly fails to add up to
                          "Items", which reads as broken arithmetic. This one
                          sums to it exactly. */}
                      <span className="text-base font-medium tabular-nums">
                        {formatMoney(item.lineSubtotal, currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-base-300 flex flex-col gap-1 border-t pt-3">
              <MoneyRow label="Items" amount={order.subtotal} currency={currency} />
              {order.discountTotal > 0 ? (
                <MoneyRow label="Discount" amount={-order.discountTotal} currency={currency} />
              ) : null}
              {order.shippingTotal > 0 ? (
                <MoneyRow label="Delivery" amount={order.shippingTotal} currency={currency} />
              ) : null}
              {order.surchargeTotal > 0 ? (
                <MoneyRow
                  label="Card fee passed on"
                  amount={order.surchargeTotal}
                  currency={currency}
                />
              ) : null}
              {order.taxTotal > 0 ? (
                <MoneyRow label="Tax" amount={order.taxTotal} currency={currency} />
              ) : null}
              {/* No gift-card line here on purpose. A card is money IN, not a
                  discount, so it is an OrderPayment and shows under the payments
                  list with its code — and the order's own total stays the value
                  of what was sold. Repeating it as a negative here would take the
                  same $150 off twice on one screen. */}
              <MoneyRow label="Order total" amount={order.total} currency={currency} emphasis />
              {order.amountPaid > 0 ? (
                <MoneyRow label="Paid so far" amount={order.amountPaid} currency={currency} />
              ) : null}
              {order.refundTotal > 0 ? (
                <MoneyRow label="Given back" amount={order.refundTotal} currency={currency} />
              ) : null}
              {due > 0 ? (
                <MoneyRow label="Still owed" amount={due} currency={currency} emphasis />
              ) : null}
            </div>
          </FormSection>

          {/* The buyer is CRM's functionality showing up on a commerce screen,
              so this block wears CRM's hue — color follows functionality, not
              the pane. */}
          <ModuleScope module="crm">
            <FormSection title="Who bought it">
              <div className="flex flex-col gap-1">
                <Text className="text-base font-medium">{customerName(order.customer)}</Text>
                {order.customer?.email ? (
                  <a href={`mailto:${order.customer.email}`} className="link text-base break-all">
                    {order.customer.email}
                  </a>
                ) : null}
                {order.customer?.company ? (
                  <Text className="text-base">
                    Trade account: {order.customer.company.companyName}
                    {order.customer.company.paymentTerms
                      ? ` · pays on ${order.customer.company.paymentTerms} terms`
                      : ''}
                  </Text>
                ) : null}
              </div>
            </FormSection>
          </ModuleScope>

          {/* Staff's functionality on a commerce screen, so it wears staff's
              hue for the same reason the buyer block wears CRM's. Gated on the
              module AND on pay access — every /v1/staff/sales/* route is
              admin-only, so a viewer gets no section rather than a 403. */}
          <SoldBySection type="order" sourceId={order.id} canSeePay={canSeeCommission} />

          {/* An order nobody is delivering does not have a "where it goes", and
              putting a Delivery address heading over the address a collecting
              customer typed for their receipt is how a shop ends up posting
              something to somebody who was going to walk in for it. */}
          <FormSection
            title={plan.collected ? 'How it leaves' : 'Where it goes'}
            description={
              plan.collected
                ? 'Nothing is being posted. The address is what they gave when they ordered.'
                : 'Copied down when the order was placed, so changing the customer’s address later never rewrites where this one went.'
            }
          >
            {/* The words the shopper chose. Absent on orders placed before
                checkout kept them, and absent is what it renders as — an order
                whose method was never recorded must not be shown a method. */}
            {plan.description ? (
              <Text className="text-base font-medium">{plan.description}</Text>
            ) : null}
            {plan.collected ? (
              <AddressBlock title="Their address" address={order.billingAddress} />
            ) : (
              <div className="grid gap-4 @md:grid-cols-2">
                <AddressBlock title="Delivery address" address={order.shippingAddress} />
                <AddressBlock title="Billing address" address={order.billingAddress} />
              </div>
            )}
          </FormSection>

          {/* The ask comes before the money, because that is the order the two
              happen in on a shop that takes no payment at checkout: you send the
              bill, then it gets paid. */}
          <OrderInvoicesSection order={order} ctx={ctx} />

          <SubSection
            title="Money in"
            description="Every attempt to take payment for this order, including the ones that did not work."
            isPending={payments.isPending}
            isError={payments.isError}
            errorText="We could not load the payments just now. The order and its money are unaffected — try reopening this order in a moment."
            emptyText="No payment has been recorded against this order yet."
            count={payments.data?.length ?? 0}
            footer={
              /* Only while money is actually outstanding. A settled, cancelled
                               or refunded order has nothing left to write down, and
                               offering the box anyway invites a second payment onto an
                               order that is already square. */
              due > 0 ? <RecordPayment order={order} due={due} /> : null
            }
          >
            <ul className="flex flex-col">
              {(payments.data ?? []).map((payment) => (
                <li
                  key={payment.id}
                  className="border-base-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-base font-medium">
                      {formatMoney(payment.amount, payment.currency)} ·{' '}
                      {PAYMENT_PROCESSOR_LABELS[payment.processor] ?? payment.processor}
                    </span>
                    <span className="text-sm">
                      {formatDateTime(payment.capturedAt ?? payment.createdAt)}
                    </span>
                    {payment.failureReason ? (
                      <span className="text-sm">{payment.failureReason}</span>
                    ) : null}
                  </div>
                  <Badge color={paymentRecordTone(payment.status)} variant="soft" size="sm">
                    {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </SubSection>

          {/* One card, two vocabularies. The words follow the shopper's own
              choice rather than the module's: "Deliveries" on an order nobody is
              delivering is the kind of wrongness that makes a person distrust
              every other word on the screen. */}
          <SubSection
            title={plan.collected ? 'Collection' : 'Deliveries'}
            description={
              /* Past tense once there is nothing left to hand over. "Mark it off
                 when they do" on an order they already collected is an
                 instruction to do something that is done, which reads as the
                 screen not having noticed. */
              plan.collected
                ? stillToFulfil
                  ? 'The customer is coming to fetch this one. Mark it off when they do.'
                  : 'They picked this up.'
                : 'Each shipment sent for this order, and how to follow it.'
            }
            isPending={fulfillments.isPending}
            isError={fulfillments.isError}
            errorText="We could not load the deliveries just now. Anything already shipped is unaffected — try reopening this order in a moment."
            emptyText={
              plan.collected
                ? 'This order has not been collected yet.'
                : 'Nothing has been sent for this order yet.'
            }
            count={fulfillments.data?.length ?? 0}
            footer={
              /* Only while something is still owed. An order already handed
                               over has nothing left to hand over, and a cancelled or
                               refunded one is refused by the server anyway — a control
                               whose only job is to return an error is worse than none. */
              stillToFulfil ? <RecordHandover order={order} plan={plan} /> : null
            }
          >
            <ul className="flex flex-col">
              {(fulfillments.data ?? []).map((shipment) => (
                <li
                  key={shipment.id}
                  className="border-base-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-base font-medium">{shipmentHeadline(shipment)}</span>
                    {shipment.trackingNumber ? (
                      shipment.trackingUrl ? (
                        <a
                          href={shipment.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="link inline-flex items-center gap-1 font-mono text-sm break-all"
                        >
                          {shipment.trackingNumber}
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                        </a>
                      ) : (
                        <span className="font-mono text-sm break-all">
                          {shipment.trackingNumber}
                        </span>
                      )
                    ) : null}
                    {/* What she typed in the note box. Asking for a note and
                        then never showing it anywhere is asking somebody to
                        write into a drawer that does not open. */}
                    {shipment.notes ? <span className="text-sm">{shipment.notes}</span> : null}
                    <span className="text-sm">
                      {/* A collection was not "sent" anywhere, and a shipment
                          with no despatch time has not been sent yet — so the
                          row falls back to when the record was made and SAYS
                          that, rather than presenting it as a despatch. */}
                      {shipment.carrier === 'pickup' && shipment.deliveredAt
                        ? `Collected ${formatDateTime(shipment.deliveredAt)}`
                        : shipment.shippedAt
                          ? `Sent ${formatDateTime(shipment.shippedAt)}`
                          : `Created ${formatDateTime(shipment.createdAt)}`}
                    </span>
                    <TrackingEditor orderId={order.id} shipment={shipment} />
                  </div>
                  <Badge color={fulfillmentTone(shipment.status)} variant="soft" size="sm">
                    {shipmentStatusLabel(shipment)}
                  </Badge>
                </li>
              ))}
            </ul>
          </SubSection>

          {/* Refunds render only when there are any: an empty "Refunds — none"
              card on every healthy order is a card that trains people to skip
              the bottom of this pane. */}
          {(refunds.data?.length ?? 0) > 0 ? (
            <FormSection title="Money given back">
              <ul className="flex flex-col">
                {(refunds.data ?? []).map((refund) => (
                  <li
                    key={refund.id}
                    className="border-base-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-base font-medium">
                        {formatMoney(refund.amount, refund.currency)}
                      </span>
                      <span className="text-sm">
                        {formatDateTime(refund.refundedAt ?? refund.createdAt)}
                      </span>
                      {refund.reason ? <span className="text-sm">{refund.reason}</span> : null}
                    </div>
                    <Badge color={refundTone(refund.status)} variant="soft" size="sm">
                      {REFUND_STATUS_LABELS[refund.status] ?? refund.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </FormSection>
          ) : null}

          {order.customerNote || order.internalNote ? (
            <FormSection title="Notes">
              {order.customerNote ? (
                <div className="flex flex-col gap-1">
                  <Heading level={3} className="text-base font-semibold">
                    From the customer
                  </Heading>
                  <Text className="text-base whitespace-pre-wrap">{order.customerNote}</Text>
                </div>
              ) : null}
              {order.internalNote ? (
                <div className="flex flex-col gap-1">
                  <Heading level={3} className="text-base font-semibold">
                    Your team’s note
                  </Heading>
                  <Text className="text-base whitespace-pre-wrap">{order.internalNote}</Text>
                </div>
              ) : null}
            </FormSection>
          ) : null}

          {/* Same treatment as cancelling: irreversible, so a plain row under a
              divider rather than a card competing with what people came to read.
              Offered only when there is money left to give back. */}
          {refundableAmount > 0 ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Text className="text-base font-medium">Refund this order</Text>
                <Text className="text-sm">
                  {/* Both halves branch. Fixing only the first left "The money leaves
                      your account straight away" standing after "nothing is sent
                      anywhere" — two sentences contradicting each other about a
                      refund, which is not a place to be vague. */}
                  {refundGoesBackToACard
                    ? `Sends ${formatMoney(refundableAmount, currency)} back to the card it was paid with. The money leaves your account straight away and this cannot be undone.`
                    : `Marks ${formatMoney(refundableAmount, currency)} as given back. You hand the money over yourself — nothing is sent anywhere, and this cannot be undone.`}{' '}
                  To give back only part of it, or to take stock back in, use a return instead.
                </Text>
              </div>
              <Button
                size="sm"
                color="danger"
                variant="outline"
                loading={refund.isPending}
                onClick={() => {
                  void onRefund();
                }}
              >
                <Undo2 className="size-4" aria-hidden />
                Refund {formatMoney(refundableAmount, currency)}
              </Button>
            </div>
          ) : null}

          {/* Rare and irreversible, so it does NOT get a card of its own beside
              the things people came here to read — a plain row after the work,
              under a divider. */}
          {cancellable ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Text className="text-base font-medium">Cancel this order</Text>
                <Text className="text-sm">
                  Marks it as cancelled so nothing more is sent. Any money already taken stays until
                  you refund it, and the order cannot be reopened afterwards.
                </Text>
              </div>
              <Button
                size="sm"
                color="danger"
                variant="outline"
                loading={cancel.isPending}
                onClick={() => {
                  // The confirm has to open after this click finishes committing;
                  // the pane never changes here, so no afterPaneChange is needed
                  // for the toast that follows it.
                  void onCancel();
                }}
              >
                <Ban className="size-4" aria-hidden />
                Cancel order
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
