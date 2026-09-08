// Order-status timeline — the lifecycle of an order rendered as a vertical
// rail (placed → paid → shipped → delivered), with cancelled / refunded as
// terminal branches. Driven entirely by the order's own lifecycle timestamps
// (placedAt / paidAt / fulfilledAt / deliveredAt / cancelledAt), so it needs no
// extra data beyond the detail payload. When a shipment carries tracking, the
// "Shipped" step surfaces a real carrier + track-your-package link.
//
// Presentational — composes silica's <Timeline>. Runs in the client tree (the
// order page is a client component) but holds no state of its own.
//
// The rail is one-sided (no <TimelineStart>): each item is a marker + content.
// A step the order has REACHED wears the order's tone; unreached steps stay
// neutral, so the colored markers read as progress at a glance.
//
// The RAIL ITSELF is silica's, drawn from `.timeline-middle`'s ::before/::after
// — this component adds no <hr> connectors. That markup is another library's
// Timeline contract; silica's says "no <hr> markup" outright, and because each
// <li> is a `1fr auto 1fr` grid whose tracks belong to start/middle/end, a
// class-less <hr> auto-placed into column 1 rendered as a black rule across the
// empty start track of every gap (issue 293). Per-segment rail color is
// therefore not expressible today; that is a silica-level ask, not something to
// re-patch here.

import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Package,
  Receipt,
  RotateCcw,
  Truck,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Timeline,
  TimelineEnd,
  TimelineItem,
  TimelineMiddle,
  type SilicaColor,
} from '@wizeworks/silicaui-react';
import { carrierLabel } from '@wizeworks/commerce-schemas';

import type { OrderDetail, OrderFulfillmentView } from '@/lib/customer-client';

/** Semantic tone for an order status — used by the header badge and the
 *  timeline track so the two always agree. */
export function orderStatusTone(status: string): SilicaColor {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'fulfilled':
      return 'info';
    case 'cancelled':
      return 'danger';
    case 'refunded':
      return 'warning';
    default:
      return 'primary';
  }
}

/** The status in the SHOPPER's words, shared by the order list and the order
 *  detail so the two can never call one fact two things. `fulfilled` is the
 *  warehouse's word for it; she is waiting on a parcel (issue 295). */
export function orderStatusLabel(status: string): string {
  switch (status) {
    case 'placed':
      return 'Placed';
    case 'fulfilled':
      return 'On its way';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  }
}

// Tailwind needs LITERAL class strings — a `text-${tone}` template never emits.
const MARK_CLASS: Record<string, string> = {
  primary: 'text-primary',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  danger: 'text-danger',
};

interface TimelineStep {
  key: string;
  label: string;
  at: string | null;
  complete: boolean;
  terminal?: boolean;
  icon: ReactNode;
  detail?: ReactNode;
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A shipment line: carrier + service and, when present, a tracking link.
 *
 *  The carrier words come from the schema package, not a local map. This file's
 *  copy was the worst of the three that had grown: it told a shopper "Drop-ship"
 *  where the owner's console said "Sent by the supplier", it had no entry for
 *  `other` so its `toUpperCase()` fallback showed the word "OTHER", and a
 *  fulfillment with no carrier at all rendered the literal word "Carrier" beside
 *  the service. The shared helper returns '' for absent, which this `filter`
 *  already knows what to do with. */
function ShipmentLine({ fulfillment }: { fulfillment: OrderFulfillmentView }): ReactNode {
  const label = [carrierLabel(fulfillment.carrier), fulfillment.service]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="mt-1.5 text-sm">
      <span className="text-base-content">{label}</span>
      {fulfillment.trackingNumber ? (
        fulfillment.trackingUrl ? (
          <a
            href={fulfillment.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary ml-2 inline-flex items-center gap-1 font-semibold"
          >
            Track {fulfillment.trackingNumber}
            <ExternalLink size={13} aria-hidden />
          </a>
        ) : (
          <span className="text-base-content ml-2">Tracking {fulfillment.trackingNumber}</span>
        )
      ) : null}
    </div>
  );
}

/** Build the ordered lifecycle steps + the track's overall tone from the order. */
function buildTimeline(order: OrderDetail): { steps: TimelineStep[]; color: SilicaColor } {
  const cancelled = order.status === 'cancelled';
  const refunded = order.status === 'refunded' || order.paymentStatus === 'refunded';
  const terminal = cancelled ? 'cancelled' : refunded ? 'refunded' : null;

  const shipments = order.fulfillments.filter(
    (f) =>
      Boolean(f.trackingNumber) ||
      Boolean(f.carrier) ||
      f.status === 'shipped' ||
      f.status === 'delivered'
  );

  const steps: TimelineStep[] = [
    {
      key: 'placed',
      label: 'Order placed',
      at: order.placedAt,
      complete: true,
      icon: <Receipt size={16} aria-hidden />,
    },
    {
      key: 'paid',
      label: 'Payment confirmed',
      at: order.paidAt,
      complete: Boolean(order.paidAt) || order.paymentStatus === 'paid',
      icon: <CreditCard size={16} aria-hidden />,
    },
  ];

  const shippedComplete = Boolean(order.fulfilledAt);
  const deliveredComplete = Boolean(order.deliveredAt);

  // On a live order, show the road ahead (shipped/delivered as upcoming). On a
  // terminal (cancelled/refunded) order, only show stages actually reached.
  if (!terminal || shippedComplete) {
    steps.push({
      key: 'shipped',
      label: 'On its way',
      at: order.fulfilledAt,
      complete: shippedComplete,
      icon: <Truck size={16} aria-hidden />,
      detail:
        shippedComplete && shipments.length > 0 ? (
          <>
            {shipments.map((f) => (
              <ShipmentLine key={f.id} fulfillment={f} />
            ))}
          </>
        ) : undefined,
    });
  }
  if (!terminal || deliveredComplete) {
    steps.push({
      key: 'delivered',
      label: 'Delivered',
      at: order.deliveredAt,
      complete: deliveredComplete,
      icon: deliveredComplete ? (
        <CheckCircle2 size={16} aria-hidden />
      ) : (
        <Package size={16} aria-hidden />
      ),
    });
  }

  if (cancelled) {
    steps.push({
      key: 'cancelled',
      label: 'Order cancelled',
      at: order.cancelledAt,
      complete: true,
      terminal: true,
      icon: <XCircle size={16} aria-hidden />,
    });
  } else if (refunded) {
    steps.push({
      key: 'refunded',
      label: 'Refunded',
      at: null,
      complete: true,
      terminal: true,
      icon: <RotateCcw size={16} aria-hidden />,
    });
  }

  const color: SilicaColor = cancelled
    ? 'danger'
    : refunded
      ? 'warning'
      : order.status === 'delivered'
        ? 'success'
        : 'primary';

  return { steps, color };
}

/** Resolve each step's visual state: the first unreached non-terminal step is
 *  the "active" (next expected) one; a terminal step is always active. */
type StepState = 'complete' | 'active' | 'upcoming';
function resolveState(steps: TimelineStep[], terminal: boolean): StepState[] {
  let activeAssigned = false;
  return steps.map((step) => {
    if (step.terminal) return 'active';
    if (step.complete) return 'complete';
    // On a terminal order nothing is "in progress" — unreached stages are muted.
    if (terminal) return 'upcoming';
    if (!activeAssigned) {
      activeAssigned = true;
      return 'active';
    }
    return 'upcoming';
  });
}

export function OrderTimeline({ order }: { order: OrderDetail }) {
  const { steps, color } = buildTimeline(order);
  const isTerminal = order.status === 'cancelled' || order.status === 'refunded';
  const states = resolveState(steps, isTerminal);
  const mark = MARK_CLASS[color] ?? 'text-primary';

  return (
    <Timeline>
      {steps.map((step, i) => {
        const reached = states[i] !== 'upcoming';
        return (
          <TimelineItem key={step.key}>
            <TimelineMiddle className={reached ? mark : 'text-base-content'}>
              {step.icon}
            </TimelineMiddle>
            <TimelineEnd className="pb-6">
              <span className="text-base-content block text-base font-semibold">{step.label}</span>
              {step.at ? (
                <span className="text-base-content mt-0.5 block text-sm">
                  {formatStamp(step.at)}
                </span>
              ) : states[i] === 'active' && !step.terminal ? (
                <span className="text-base-content mt-0.5 block text-sm">In progress</span>
              ) : null}
              {step.detail}
            </TimelineEnd>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
