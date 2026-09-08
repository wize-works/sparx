'use client';

// WHAT THEY BOUGHT — the line items, then what it all came to.
//
// One card, because the totals are the sum of the rows directly above them and
// splitting them apart makes the reader carry a number across a gap.

import { Text } from '@wizeworks/silicaui-react';

import { FormSection } from '../../components/form-section';
import { MoneyRow } from './order-detail-blocks';
import { amountDue, formatMoney, type Order } from './data';
import { deliveryPlan } from './order-types';

type OrderItem = NonNullable<Order['items']>[number];

const ROW =
  'border-base-300 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b py-3 first:pt-0 last:border-b-0 last:pb-0';

function LineRow({ item, currency }: { item: OrderItem; currency: string }) {
  const partlySent = item.quantityFulfilled > 0 && item.quantityFulfilled < item.quantity;
  return (
    <li className={ROW}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-base font-medium">{item.name}</span>
        <span className="font-mono text-sm break-all">{item.sku}</span>
        <span className="text-sm">
          {item.quantity} × {formatMoney(item.unitPrice, currency)}
          {item.discountAmount > 0 ? ` · ${formatMoney(item.discountAmount, currency)} off` : ''}
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
      {/* Quantity × price, NOT the stored `lineTotal` — that one folds the
          line's own tax in, while the totals block charges tax and discount as
          their own lines, so lineTotal visibly fails to add up to "Items". */}
      <span className="text-base font-medium tabular-nums">
        {formatMoney(item.lineSubtotal, currency)}
      </span>
    </li>
  );
}

function OrderTotals({ order }: { order: Order }) {
  const currency = order.currency;
  const due = amountDue(order);
  // Free delivery is a decision she made, not a line with nothing in it, so a
  // posted order shows the row at zero. Only a collected one has no delivery.
  const posted = !deliveryPlan(order).collected;
  return (
    <div className="border-base-300 flex flex-col gap-1 border-t pt-3">
      <MoneyRow label="Items" amount={order.subtotal} currency={currency} />
      {order.discountTotal > 0 ? (
        <MoneyRow label="Discount" amount={-order.discountTotal} currency={currency} />
      ) : null}
      {posted ? (
        <MoneyRow
          label="Delivery"
          amount={order.shippingTotal}
          currency={currency}
          {...(order.shippingTotal > 0 ? {} : { reads: 'Free' })}
        />
      ) : null}
      {order.surchargeTotal > 0 ? (
        <MoneyRow label="Card fee passed on" amount={order.surchargeTotal} currency={currency} />
      ) : null}
      {order.taxTotal > 0 ? (
        <MoneyRow label="Tax" amount={order.taxTotal} currency={currency} />
      ) : null}
      {/* No gift-card line here on purpose. A card is money IN, not a discount,
          so it is an OrderPayment and shows under "Money in" with its code — and
          the order's own total stays the value of what was sold. Repeating it as
          a negative here would take the same $150 off twice on one screen. */}
      <MoneyRow label="Order total" amount={order.total} currency={currency} emphasis />
      {order.amountPaid > 0 ? (
        <MoneyRow label="Paid so far" amount={order.amountPaid} currency={currency} />
      ) : null}
      {order.refundTotal > 0 ? (
        <MoneyRow label="Given back" amount={order.refundTotal} currency={currency} />
      ) : null}
      {due > 0 ? <MoneyRow label="Still owed" amount={due} currency={currency} emphasis /> : null}
    </div>
  );
}

export function OrderLines({ order }: { order: Order }) {
  const items = order.items ?? [];
  return (
    <FormSection title="What they bought">
      {items.length === 0 ? (
        <Text>This order has no items on it, which usually means it was imported.</Text>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <LineRow key={item.id} item={item} currency={order.currency} />
          ))}
        </ul>
      )}
      <OrderTotals order={order} />
    </FormSection>
  );
}
