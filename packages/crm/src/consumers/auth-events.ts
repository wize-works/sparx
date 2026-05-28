// Auth-event consumers (Better Auth → CRM).
//
// Better Auth publishes user.login / user.password_reset / user.account_created
// to the platform bus. We translate those into activities on the linked
// customers row (via the authUserId FK). If no customers row exists yet
// (signup before any commerce or CRM interaction), we no-op — the row will
// be created the first time a service writes a customer record, and the
// next auth event will record then.

import { gateHandler, type ConsumerContext } from './registry';
import { resolveCustomerByAuthUserId } from './projection';
import { withTenant } from '@sparx/db';

interface AuthEventPayload {
    authUserId: string;
    email?: string;
    occurredAt?: string;
    ipAddress?: string;
    userAgent?: string;
}

const AUTH_MAP = {
    'user.login': 'login',
    'user.password_reset': 'password.reset',
    'user.account_created': 'account.created',
} as const;

export function registerAuthEventConsumers(ctx: ConsumerContext): (() => void)[] {
    return Object.entries(AUTH_MAP).map(([topic, activityType]) =>
        ctx.bus.subscribe(
            topic,
            gateHandler(async (event) => {
                const payload = event.payload as AuthEventPayload;
                const customer = await resolveCustomerByAuthUserId(
                    { tenantId: event.tenantId },
                    payload.authUserId
                );
                if (!customer) return;

                const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : event.occurredAt;
                await withTenant({ tenantId: event.tenantId }, async (tx) => {
                    await tx.crmActivity.create({
                        data: {
                            tenantId: event.tenantId,
                            customerId: customer.id,
                            type: activityType,
                            description: null,
                            actorId: payload.authUserId,
                            actorType: 'customer',
                            occurredAt,
                            linkedEntityType: 'AuthUser',
                            linkedEntityId: payload.authUserId,
                            metadata: {
                                ...(payload.ipAddress ? { ipAddress: payload.ipAddress } : {}),
                                ...(payload.userAgent ? { userAgent: payload.userAgent } : {}),
                            },
                        },
                    });
                });
            })
        )
    );
}

export const AUTH_CONSUMER_TOPICS = Object.keys(AUTH_MAP) as (keyof typeof AUTH_MAP)[];
