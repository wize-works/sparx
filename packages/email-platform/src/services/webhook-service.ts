// webhookService — ingests Mailgun delivery/engagement webhooks.
//
// Mailgun POSTs a JSON envelope: { signature: {timestamp, token, signature},
// "event-data": { event, recipient, message.headers, user-variables, ... } }.
// We verify the HMAC signature, attribute the event to a tenant via the
// `tenant_id` user variable (stamped on every send by email-worker), then:
//   • append an EmailEvent (the analytics source of truth), and
//   • on bounce/complaint/unsubscribe, record an EmailSuppression.
//
// The receiver is unauthenticated (Mailgun has no bearer token) — the
// signature IS the auth. Tenant context is synthesized from the verified
// payload, so the withTenant write is still RLS-scoped to the right tenant.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { withTenant } from '@sparx/db';
import type { Prisma } from '@sparx/db';

import { recordFromWebhook } from './suppression-service';

export interface MailgunSignature {
  timestamp: string;
  token: string;
  signature: string;
}

/** Verify the Mailgun webhook HMAC: hex(HMAC-SHA256(signingKey, timestamp+token)). */
export function verifyMailgunSignature(sig: MailgunSignature, signingKey: string): boolean {
  if (!sig.timestamp || !sig.token || !sig.signature) return false;
  const expected = createHmac('sha256', signingKey)
    .update(sig.timestamp + sig.token)
    .digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig.signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Mailgun event → our EmailEvent.type. Permanent failures are bounces;
// temporary failures stay as `failed` (transient, not suppression-worthy).
function mapEventType(event: string, severity?: string): string | null {
  switch (event) {
    case 'accepted':
      return 'accepted';
    case 'delivered':
      return 'delivered';
    case 'opened':
      return 'opened';
    case 'clicked':
      return 'clicked';
    case 'complained':
      return 'complained';
    case 'unsubscribed':
      return 'unsubscribed';
    case 'failed':
      return severity === 'permanent' ? 'bounced' : 'failed';
    default:
      return null;
  }
}

// type → suppression (scope, reason), or null if it doesn't suppress.
function suppressionFor(type: string): { scope: string; reason: string } | null {
  switch (type) {
    case 'bounced':
      return { scope: 'all', reason: 'bounce' };
    case 'complained':
      return { scope: 'all', reason: 'complaint' };
    case 'unsubscribed':
      return { scope: 'marketing', reason: 'unsubscribe' };
    default:
      return null;
  }
}

interface MailgunEventData {
  event?: string;
  timestamp?: number;
  recipient?: string;
  severity?: string;
  reason?: string;
  message?: { headers?: { 'message-id'?: string } };
  'user-variables'?: Record<string, unknown>;
  'delivery-status'?: { message?: string; description?: string; code?: number };
}

export interface IngestResult {
  handled: boolean;
  reason?: 'no_tenant' | 'unknown_event';
  tenantId?: string;
  type?: string;
}

/** Ingest one verified Mailgun webhook envelope. Returns handled=false (still a
 *  200 to Mailgun) when the event can't be attributed or isn't one we track. */
export async function ingest(eventData: MailgunEventData): Promise<IngestResult> {
  const type = mapEventType(eventData.event ?? '', eventData.severity);
  if (!type) return { handled: false, reason: 'unknown_event' };

  const vars = eventData['user-variables'] ?? {};
  const tenantId = typeof vars.tenant_id === 'string' ? vars.tenant_id : undefined;
  if (!tenantId) return { handled: false, reason: 'no_tenant', type };

  const recipient = eventData.recipient ?? '';
  const broadcastId = typeof vars.broadcast_id === 'string' ? vars.broadcast_id : null;
  const automationKey = typeof vars.automation_key === 'string' ? vars.automation_key : null;
  const customerId = typeof vars.customer_id === 'string' ? vars.customer_id : null;
  const messageId = eventData.message?.headers?.['message-id'] ?? null;
  const occurredAt = eventData.timestamp ? new Date(eventData.timestamp * 1000) : new Date();
  const reason =
    eventData.reason ??
    eventData['delivery-status']?.description ??
    eventData['delivery-status']?.message ??
    null;

  await withTenant({ tenantId }, async (tx) => {
    await tx.emailEvent.create({
      data: {
        tenantId,
        type,
        recipient,
        messageId,
        broadcastId,
        automationKey,
        customerId,
        reason,
        occurredAt,
        raw: eventData as unknown as Prisma.InputJsonValue,
      },
    });

    const suppress = suppressionFor(type);
    if (suppress && recipient) {
      await recordFromWebhook(tx, tenantId, {
        email: recipient,
        scope: suppress.scope,
        reason: suppress.reason,
        customerId,
      });
    }
  });

  return { handled: true, tenantId, type };
}
