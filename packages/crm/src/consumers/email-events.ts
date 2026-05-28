// Email engagement consumers.
//
// Subscribes to Postal-emitted email.* events (via the Email module's bridge
// to Pub/Sub). Each event appends an activity row anchored to the customer.
// No denormalized stats yet — the Phase 4 engagement aggregator will populate
// customers.email_opens_30d etc. once that landing surface is real.

import { withTenant } from '@sparx/db';

import { gateHandler, type ConsumerContext } from './registry';
import { resolveCustomerByEmail } from './resolve';

interface EmailEventPayload {
  /** Customer-id is the preferred identifier; email is the fallback. */
  customerId?: string;
  email?: string;
  messageId: string;
  campaignId?: string;
  subject?: string;
  occurredAt?: string;
}

interface EmailBouncedPayload extends EmailEventPayload {
  reason?: string;
}

const EMAIL_TOPICS = [
  'email.sent',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.unsubscribed',
] as const;

const TOPIC_TO_ACTIVITY: Record<(typeof EMAIL_TOPICS)[number], string> = {
  'email.sent': 'email.sent',
  'email.opened': 'email.opened',
  'email.clicked': 'email.clicked',
  'email.bounced': 'email.bounced',
  'email.unsubscribed': 'email.unsubscribed',
};

export function registerEmailEventConsumers(ctx: ConsumerContext): (() => void)[] {
  return EMAIL_TOPICS.map((topic) =>
    ctx.bus.subscribe(
      topic,
      gateHandler(async (event) => {
        const payload = event.payload as EmailEventPayload | EmailBouncedPayload;
        const customerId = await resolveTarget(event.tenantId, payload);
        if (!customerId) return; // engagement on a stranger — drop silently

        const occurredAt = payload.occurredAt ? new Date(payload.occurredAt) : event.occurredAt;
        const description = payload.subject != null ? `Email: ${payload.subject}` : null;

        await withTenant({ tenantId: event.tenantId }, async (tx) => {
          await tx.crmActivity.create({
            data: {
              tenantId: event.tenantId,
              customerId,
              type: TOPIC_TO_ACTIVITY[topic],
              description,
              actorId: customerId,
              actorType: 'customer',
              occurredAt,
              linkedEntityType: 'EmailMessage',
              linkedEntityId: null,
              metadata: {
                messageId: payload.messageId,
                ...(payload.campaignId ? { campaignId: payload.campaignId } : {}),
                ...((payload as EmailBouncedPayload).reason
                  ? { reason: (payload as EmailBouncedPayload).reason }
                  : {}),
              },
            },
          });

          // Unsubscribe flips do-not-contact. The email module also keeps
          // its own suppression list; this is the merchant-visible mirror.
          if (topic === 'email.unsubscribed') {
            await tx.customer.update({
              where: { id: customerId },
              data: { doNotContact: true },
            });
          }
        });
      })
    )
  );
}

async function resolveTarget(tenantId: string, payload: EmailEventPayload): Promise<string | null> {
  if (payload.customerId) return payload.customerId;
  if (payload.email) {
    const customer = await resolveCustomerByEmail(tenantId, payload.email);
    return customer?.id ?? null;
  }
  return null;
}

export const EMAIL_CONSUMER_TOPICS = EMAIL_TOPICS;
