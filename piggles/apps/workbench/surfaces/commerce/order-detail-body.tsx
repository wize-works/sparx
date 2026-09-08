'use client';

// The order pane's scrolling body, in the order it reads: what it is, what was
// bought, who bought it, where it goes, what happened to the money, and only
// then the two moves that cannot be taken back.

import { COLUMN, OrderIdentity } from './order-detail-blocks';
import { DueDaySection } from './order-detail-due-day';
import { OrderLines } from './order-detail-lines';
import { BuyerSection, DestinationSection, OrderHeadline } from './order-detail-parties';
import { SoldBySection } from './sold-by-section';
import { PaymentsSection, RefundsSection } from './order-detail-money';
import { InvoicesSection } from './order-detail-invoices';
import { HandoverSection } from './order-detail-handover';
import { ReturnsSection } from './order-detail-returns';
import { CancelRow, OrderNotes, RefundRow } from './order-detail-risk';
import type { OrderFacts } from './order-detail-facts';
import type { useOrderRisk } from './order-detail-actions';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import type { useOrderFulfillments, useOrderPayments, useOrderRefunds, Order } from './data';

export interface OrderBodyProps {
  order: Order;
  facts: OrderFacts;
  /** The returns section opens the return it makes, so it needs the pane's own
   *  way of opening things rather than a route push. */
  ctx: SurfaceContext;
  siteName: string | null;
  /** Every /v1/staff/sales/* route is admin-only, so "who sold it" needs the
   *  staff module AND pay access — a viewer gets no section rather than a 403. */
  canSeeCommission: boolean;
  payments: ReturnType<typeof useOrderPayments>;
  fulfillments: ReturnType<typeof useOrderFulfillments>;
  refunds: ReturnType<typeof useOrderRefunds>;
  risk: ReturnType<typeof useOrderRisk>;
}

export function OrderBody(props: OrderBodyProps) {
  const { order, facts } = props;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className={COLUMN}>
        <OrderIdentity order={order} siteName={props.siteName} />
        {/* Above the money, because the day it is due is the thing a shop that
            makes things needs off this pane first (issue 026). */}
        <DueDaySection order={order} />
        <OrderHeadline order={order} facts={facts} />
        <OrderLines order={order} />
        <BuyerSection order={order} />

        {/* Staff's functionality on a commerce screen, so it wears staff's hue
            for the same reason the buyer block wears CRM's. */}
        <SoldBySection type="order" sourceId={order.id} canSeePay={props.canSeeCommission} />

        <DestinationSection order={order} facts={facts} />
        {/* The ask comes before the money, because that is the order the two
            happen in on a shop that takes no payment at checkout: you send the
            bill, then it gets paid. */}
        <InvoicesSection order={order} ctx={props.ctx} />
        <PaymentsSection order={order} payments={props.payments} />
        <HandoverSection
          order={order}
          plan={facts.plan}
          stillToFulfil={facts.stillToFulfil}
          fulfillments={props.fulfillments}
        />
        {/* It went out, it came back, and only then does the money change —
            so this reads between the handover and what was given back. */}
        <ReturnsSection order={order} ctx={props.ctx} />
        <RefundsSection refunds={props.refunds} />
        <OrderNotes order={order} />
        <RefundRow
          order={order}
          amount={facts.refundableAmount}
          says={facts.refundSays}
          risk={props.risk}
        />
        <CancelRow order={order} cancellable={facts.cancellable} risk={props.risk} />
      </div>
    </div>
  );
}
