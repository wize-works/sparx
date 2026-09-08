'use client';

// How the order reaches the customer — one card with two vocabularies.
//
// The words follow the shopper's own choice rather than the module's:
// "Deliveries" on an order nobody is delivering is the kind of wrongness that
// makes a person distrust every other word on the screen.

import { useState } from 'react';
import { Badge, Button, Input, useToast } from '@wizeworks/silicaui-react';
import { faArrowUpRightFromSquare } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';

import { SubSection } from './order-detail-blocks';
import { RecordHandover } from './record-handover';
import type { useOrderFulfillments } from './data';
import {
  formatDateTime,
  fulfillmentTone,
  orderErrorMessage,
  shipmentHeadline,
  shipmentStatusLabel,
  useUpdateTracking,
  type Order,
} from './data';
import type { DeliveryPlan } from './order-types';

type Fulfillments = ReturnType<typeof useOrderFulfillments>;
type Shipment = NonNullable<Fulfillments['data']>[number];

const ROW =
  'border-base-300 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0';

/** A collection was not "sent" anywhere, and a shipment with no despatch time
 *  has not been sent yet — so this falls back to when the record was made and
 *  SAYS that, rather than presenting it as a despatch. */
function whenItMoved(shipment: Shipment): string {
  if (shipment.carrier === 'pickup' && shipment.deliveredAt) {
    return `Collected ${formatDateTime(shipment.deliveredAt)}`;
  }
  if (shipment.shippedAt) return `Sent ${formatDateTime(shipment.shippedAt)}`;
  return `Created ${formatDateTime(shipment.createdAt)}`;
}

function Tracking({ shipment }: { shipment: Shipment }) {
  if (!shipment.trackingNumber) return null;
  if (!shipment.trackingUrl) {
    return <span className="font-mono text-sm break-all">{shipment.trackingNumber}</span>;
  }
  return (
    <a
      href={shipment.trackingUrl}
      target="_blank"
      rel="noreferrer"
      className="link inline-flex items-center gap-1 font-mono text-sm break-all"
    >
      {shipment.trackingNumber}
      <Icon glyph={faArrowUpRightFromSquare} className="size-3 shrink-0" aria-hidden />
    </a>
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
function TrackingEditor({ orderId, shipment }: { orderId: string; shipment: Shipment }) {
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

function ShipmentRow({ orderId, shipment }: { orderId: string; shipment: Shipment }) {
  return (
    <li className={ROW}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-base font-medium">{shipmentHeadline(shipment)}</span>
        <Tracking shipment={shipment} />
        {/* What she typed in the note box. Asking for a note and never showing
            it is asking somebody to write into a drawer that does not open. */}
        {shipment.notes ? <span className="text-sm">{shipment.notes}</span> : null}
        <span className="text-sm">{whenItMoved(shipment)}</span>
        <TrackingEditor orderId={orderId} shipment={shipment} />
      </div>
      <Badge color={fulfillmentTone(shipment.status)} variant="soft" size="sm">
        {shipmentStatusLabel(shipment)}
      </Badge>
    </li>
  );
}

/** Past tense once there is nothing left to hand over. "Mark it off when they
 *  do" on an order they already collected reads as the screen not noticing. */
function describe(plan: DeliveryPlan, stillToFulfil: boolean): string {
  if (!plan.collected) return 'Each shipment sent for this order, and how to follow it.';
  return stillToFulfil
    ? 'The customer is coming to fetch this one. Mark it off when they do.'
    : 'They picked this up.';
}

export function HandoverSection({
  order,
  plan,
  stillToFulfil,
  fulfillments,
}: {
  order: Order;
  plan: DeliveryPlan;
  stillToFulfil: boolean;
  fulfillments: Fulfillments;
}) {
  return (
    <SubSection
      title={plan.collected ? 'Collection' : 'Deliveries'}
      description={describe(plan, stillToFulfil)}
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
        /* Only while something is still owed — the server refuses a handover on
           a cancelled or refunded order anyway. */
        stillToFulfil ? <RecordHandover order={order} plan={plan} /> : null
      }
    >
      <ul className="flex flex-col">
        {(fulfillments.data ?? []).map((shipment) => (
          <ShipmentRow key={shipment.id} orderId={order.id} shipment={shipment} />
        ))}
      </ul>
    </SubSection>
  );
}
