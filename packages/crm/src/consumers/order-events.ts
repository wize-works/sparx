// Order-lifecycle consumers.
//
// Subscribes to Commerce's order.* topics and:
//   1. Appends a matching activity row.
//   2. Updates the customer's denormalized commerce stats (total_spent,
//      order_count, first_order_at, last_order_at).
//
// Both happen in the same withTenant() transaction so a half-applied write
// is impossible. The activity is the audit trail; the denormalized columns
// are the read-side optimization for list filters and segment rules.
//
// Until Commerce lands, the payload shape comes from docs/06 §8. Tests in
// Phase 2 publish synthetic events against this shape — when Commerce
// ships, swap the publisher; consumers don't change.

import { withTenant } from '@sparx/db';

import type { ConsumerContext } from './registry';
import { gateHandler } from './registry';

interface OrderCreatedPayload {
    orderId: string;
    customerId: string;
    total: number;
    currency: string;
    placedAt: string; // ISO
}

interface OrderLifecyclePayload {
    orderId: string;
    customerId: string;
    occurredAt?: string;
}

interface OrderRefundedPayload extends OrderLifecyclePayload {
    refundAmount: number;
    currency: string;
}

const TOPICS = [
    'order.created',
    'order.fulfilled',
    'order.delivered',
    'order.cancelled',
    'order.refunded',
] as const;

export function registerOrderEventConsumers(ctx: ConsumerContext): (() => void)[] {
    return [
        ctx.bus.subscribe(
            'order.created',
            gateHandler(async (event) => {
                const payload = event.payload as OrderCreatedPayload;
                const occurredAt = new Date(payload.placedAt);

                await withTenant({ tenantId: event.tenantId }, async (tx) => {
                    // Append the activity (idempotent via unique on
                    // (tenant_id, type, linked_entity_id, occurred_at) — see Phase 2
                    // schema follow-up).
                    await tx.crmActivity.create({
                        data: {
                            tenantId: event.tenantId,
                            customerId: payload.customerId,
                            type: 'order.placed',
                            description: `Order ${payload.orderId} placed (${formatMoney(payload.total, payload.currency)})`,
                            actorId: payload.customerId,
                            actorType: 'customer',
                            occurredAt,
                            linkedEntityType: 'Order',
                            linkedEntityId: payload.orderId,
                            metadata: {
                                orderId: payload.orderId,
                                total: payload.total,
                                currency: payload.currency,
                            },
                        },
                    });

                    // Bump denormalized commerce stats. We use atomic increments so
                    // two concurrent order.created events for the same customer
                    // can't lose a write to a read-modify-write race.
                    await tx.customer.update({
                        where: { id: payload.customerId },
                        data: {
                            totalSpent: { increment: payload.total },
                            orderCount: { increment: 1 },
                            lastOrderAt: occurredAt,
                        },
                    });

                    // first_order_at: only set if currently null. Raw UPDATE avoids
                    // the SELECT-then-UPDATE roundtrip and stays atomic with the
                    // surrounding transaction.
                    await tx.$executeRaw`
            UPDATE customers
            SET first_order_at = ${occurredAt}
            WHERE id = ${payload.customerId}::uuid
              AND first_order_at IS NULL
          `;
                });
            })
        ),

        ctx.bus.subscribe(
            'order.fulfilled',
            gateHandler(async (event) => {
                await recordLifecycleActivity(
                    event.tenantId,
                    event.payload as OrderLifecyclePayload,
                    'order.shipped'
                );
            })
        ),

        ctx.bus.subscribe(
            'order.delivered',
            gateHandler(async (event) => {
                await recordLifecycleActivity(
                    event.tenantId,
                    event.payload as OrderLifecyclePayload,
                    'order.delivered'
                );
            })
        ),

        ctx.bus.subscribe(
            'order.cancelled',
            gateHandler(async (event) => {
                await recordLifecycleActivity(
                    event.tenantId,
                    event.payload as OrderLifecyclePayload,
                    'order.cancelled'
                );
            })
        ),

        ctx.bus.subscribe(
            'order.refunded',
            gateHandler(async (event) => {
                const payload = event.payload as OrderRefundedPayload;
                const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
                await withTenant({ tenantId: event.tenantId }, async (tx) => {
                    await tx.crmActivity.create({
                        data: {
                            tenantId: event.tenantId,
                            customerId: payload.customerId,
                            type: 'order.refunded',
                            description: `Order ${payload.orderId} refunded (${formatMoney(payload.refundAmount, payload.currency)})`,
                            actorId: null,
                            actorType: 'system',
                            occurredAt,
                            linkedEntityType: 'Order',
                            linkedEntityId: payload.orderId,
                            metadata: {
                                orderId: payload.orderId,
                                refundAmount: payload.refundAmount,
                                currency: payload.currency,
                            },
                        },
                    });
                    // Negative spend so the customer's lifetime value tracks reality.
                    await tx.customer.update({
                        where: { id: payload.customerId },
                        data: { totalSpent: { decrement: payload.refundAmount } },
                    });
                });
            })
        ),
    ];
}

async function recordLifecycleActivity(
    tenantId: string,
    payload: OrderLifecyclePayload,
    type: 'order.shipped' | 'order.delivered' | 'order.cancelled'
): Promise<void> {
    const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : new Date();
    await withTenant({ tenantId }, async (tx) => {
        await tx.crmActivity.create({
            data: {
                tenantId,
                customerId: payload.customerId,
                type,
                description: null,
                actorId: null,
                actorType: 'system',
                occurredAt,
                linkedEntityType: 'Order',
                linkedEntityId: payload.orderId,
                metadata: { orderId: payload.orderId },
            },
        });
    });
}

function formatMoney(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
        return `${amount} ${currency}`;
    }
}

export const ORDER_CONSUMER_TOPICS = TOPICS;
export type OrderCreatedEventPayload = OrderCreatedPayload;
