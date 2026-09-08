'use client';

// Writing down that the goods went.
//
// `POST /v1/orders/:id/fulfillments` has always existed and nothing in either
// console called it. The order pane listed shipments and said "Nothing has been
// sent for this order yet" — true, and permanently true.
//
// The pane's only fulfilment-shaped action was **Send it to the warehouse**,
// which builds a picking walk. A walk tells somebody what to go and fetch; it
// marks nothing as gone. A bakery with a counter has no warehouse, so every
// order it ever took stayed open forever at `placed`.
//
// ── TWO SHAPES, BECAUSE THEY ARE TWO EVENTS ─────────────────────────────────
//
// Collected: one button and an optional note. There is no carrier, no tracking
// number and nothing to follow, so asking for any of it is asking her to answer
// questions about a van that does not exist.
//
// Posted: who took it, and the number the customer will ask about. Three fields
// at most, and only one of them is required.

import { useState } from 'react';
import { Button, Input, NativeSelect, useToast } from '@wizeworks/silicaui-react';
import {
  orderErrorMessage,
  useRecordFulfillment,
  type DeliveryPlan,
  type Order,
  type OrderItem,
} from './data';

/** The API's `Carrier` enum, in the words a business would use. `digital` and
 *  `dropship` are absent on purpose: neither is a thing somebody hands to a
 *  courier at a counter, and both are set by the systems that perform them. */
const CARRIERS = [
  { value: 'usps', label: 'USPS' },
  { value: 'ups', label: 'UPS' },
  { value: 'fedex', label: 'FedEx' },
  { value: 'dhl', label: 'DHL' },
  { value: 'other', label: 'Someone else' },
] as const;

/** Everything still owed on the order, at the quantity still owed. A partial
 *  handover is a real thing, but it is not what this control is for — the
 *  common case by a distance is "all of it, now", and a per-line quantity grid
 *  in front of that is a form standing between her and one button. */
function outstandingLines(items: OrderItem[]) {
  return items
    .map((item) => ({
      orderItemId: item.id,
      quantity: item.quantity - item.quantityFulfilled,
    }))
    .filter((line) => line.quantity > 0);
}

export function RecordHandover({ order, plan }: { order: Order; plan: DeliveryPlan }) {
  const record = useRecordFulfillment(order.id);
  const toast = useToast();
  const [carrier, setCarrier] = useState<string>('usps');
  const [tracking, setTracking] = useState('');
  const [note, setNote] = useState('');

  const lines = outstandingLines(order.items ?? []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lines.length === 0) return;
    record.mutate(
      {
        status: plan.collected ? 'delivered' : 'shipped',
        lines,
        carrier: plan.collected ? 'pickup' : carrier,
        // The words the shopper chose, kept on the record so the pane can say
        // how it went without re-deriving it from a rate ref.
        ...(plan.description ? { service: plan.description } : {}),
        ...(plan.collected ? {} : { trackingNumber: tracking }),
        notes: note,
      },
      {
        onSuccess: () => {
          setTracking('');
          setNote('');
          // "They can follow it from here" is only true when there is something
          // to follow. The tracking number is optional, and leaving it out is
          // the normal case for a shop that walks its parcels to the post
          // office — the customer's email then carries the carrier and nothing
          // else, and the "Track your package" button is not in it at all. The
          // message says which of the two just happened.
          toast.add({
            title: plan.collected ? 'Marked as collected' : 'Marked as sent',
            description: plan.collected
              ? 'This order is finished.'
              : tracking.trim()
                ? 'The customer has the tracking number and can follow it from here.'
                : 'The customer has been told it is on its way. Add a tracking number later if you get one.',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: plan.collected ? 'Could not mark it collected' : 'Could not mark it sent',
            description: orderErrorMessage(
              error,
              'Nothing changed on this order. Try again in a moment.'
            ),
            type: 'error',
          });
        },
      }
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border-base-300 mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
    >
      {plan.collected ? null : (
        <>
          <label className="flex min-w-[9rem] flex-1 flex-col gap-1.5">
            <span className="text-base font-medium">Who took it</span>
            <NativeSelect
              value={carrier}
              onChange={(event) => {
                setCarrier(event.target.value);
              }}
            >
              {CARRIERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
            <span className="text-base font-medium">Tracking number (optional)</span>
            <Input
              value={tracking}
              onChange={(event) => {
                setTracking(event.target.value);
              }}
            />
          </label>
        </>
      )}
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5">
        <span className="text-base font-medium">Anything to note (optional)</span>
        <Input
          value={note}
          placeholder={plan.collected ? 'Who picked it up…' : 'Left with a neighbor…'}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </label>
      <Button type="submit" color="primary" loading={record.isPending}>
        {plan.collected ? 'They collected it' : 'Mark it as sent'}
      </Button>
    </form>
  );
}
