// Quote/invoice lifecycle consumers.
//
// Subscribes to the B2B module's quote.* and invoice.* topics. Each event
// appends an activity row to the customer (and to the deal, when one is
// linked via the deal_quotes join — Commerce/B2B will pass dealId in the
// payload once those modules land).

import { withTenant } from '@sparx/db';

import { gateHandler, type ConsumerContext } from './registry';

interface QuoteEventPayload {
    quoteId: string;
    customerId: string;
    dealId?: string;
    b2bAccountId?: string;
    total?: number;
    currency?: string;
    occurredAt?: string;
}

interface InvoiceEventPayload {
    invoiceId: string;
    customerId: string;
    b2bAccountId?: string;
    total?: number;
    currency?: string;
    daysOverdue?: number;
    occurredAt?: string;
}

const QUOTE_MAP = {
    'quote.created': 'quote.submitted',
    'quote.accepted': 'quote.accepted',
    'quote.declined': 'quote.declined',
    'quote.expired': 'quote.expired',
} as const;

const INVOICE_MAP = {
    'invoice.sent': 'invoice.sent',
    'invoice.paid': 'invoice.paid',
    'invoice.overdue': 'invoice.overdue',
} as const;

export function registerQuoteEventConsumers(ctx: ConsumerContext): (() => void)[] {
    const teardowns: (() => void)[] = [];

    for (const [topic, activityType] of Object.entries(QUOTE_MAP)) {
        teardowns.push(
            ctx.bus.subscribe(
                topic,
                gateHandler(async (event) => {
                    const payload = event.payload as QuoteEventPayload;
                    const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : event.occurredAt;
                    await withTenant({ tenantId: event.tenantId }, async (tx) => {
                        await tx.crmActivity.create({
                            data: {
                                tenantId: event.tenantId,
                                customerId: payload.customerId,
                                dealId: payload.dealId ?? null,
                                b2bAccountId: payload.b2bAccountId ?? null,
                                type: activityType,
                                description:
                                    payload.total != null
                                        ? `Quote ${payload.quoteId} — ${payload.total} ${payload.currency ?? 'USD'}`
                                        : `Quote ${payload.quoteId}`,
                                actorId: null,
                                actorType: 'system',
                                occurredAt,
                                linkedEntityType: 'Quote',
                                linkedEntityId: payload.quoteId,
                                metadata: {
                                    quoteId: payload.quoteId,
                                    ...(payload.dealId ? { dealId: payload.dealId } : {}),
                                    ...(payload.total != null ? { total: payload.total } : {}),
                                    ...(payload.currency ? { currency: payload.currency } : {}),
                                },
                            },
                        });
                    });
                })
            )
        );
    }

    for (const [topic, activityType] of Object.entries(INVOICE_MAP)) {
        teardowns.push(
            ctx.bus.subscribe(
                topic,
                gateHandler(async (event) => {
                    const payload = event.payload as InvoiceEventPayload;
                    const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : event.occurredAt;
                    await withTenant({ tenantId: event.tenantId }, async (tx) => {
                        await tx.crmActivity.create({
                            data: {
                                tenantId: event.tenantId,
                                customerId: payload.customerId,
                                b2bAccountId: payload.b2bAccountId ?? null,
                                type: activityType,
                                description:
                                    payload.total != null
                                        ? `Invoice ${payload.invoiceId} — ${payload.total} ${payload.currency ?? 'USD'}`
                                        : `Invoice ${payload.invoiceId}`,
                                actorId: null,
                                actorType: 'system',
                                occurredAt,
                                linkedEntityType: 'Invoice',
                                linkedEntityId: payload.invoiceId,
                                metadata: {
                                    invoiceId: payload.invoiceId,
                                    ...(payload.total != null ? { total: payload.total } : {}),
                                    ...(payload.currency ? { currency: payload.currency } : {}),
                                    ...(payload.daysOverdue != null ? { daysOverdue: payload.daysOverdue } : {}),
                                },
                            },
                        });
                    });
                })
            )
        );
    }

    return teardowns;
}

export const QUOTE_CONSUMER_TOPICS = [
    ...Object.keys(QUOTE_MAP),
    ...Object.keys(INVOICE_MAP),
] as const;
