// Mailgun delivery/engagement webhook receiver (public — the HMAC signature is
// the auth, Mailgun sends no bearer token). Lives under /v1/public/ so the
// auth plugin treats it as unauthenticated.
//
//   POST /v1/public/email/mailgun-webhook
//
// Mailgun posts { signature: {timestamp, token, signature}, "event-data": {...} }.
// We verify the signature against SPARX_MAILGUN_WEBHOOK_SIGNING_KEY, then hand
// the event-data to webhookService.ingest (which attributes it to a tenant via
// the `tenant_id` user variable and writes EmailEvent / EmailSuppression).
//
// Always 200 on a valid signature — even for events we can't attribute or don't
// track — so Mailgun doesn't retry. 406 on a bad signature.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { webhookService } from '@sparx/email-platform';
import { ok } from '@sparx/api-core/envelope';
import { ApiError } from '@sparx/api-core/errors';

const WebhookBody = z.object({
  signature: z.object({
    timestamp: z.string(),
    token: z.string(),
    signature: z.string(),
  }),
  'event-data': z.record(z.string(), z.unknown()),
});

const emailWebhookRoutes: FastifyPluginAsync = (app) => {
  app.post('/v1/public/email/mailgun-webhook', async (request) => {
    const body = WebhookBody.parse(request.body);

    const signingKey = process.env.SPARX_MAILGUN_WEBHOOK_SIGNING_KEY;
    if (signingKey) {
      const valid = webhookService.verifyMailgunSignature(body.signature, signingKey);
      if (!valid) {
        // Reject — do not process. 406 is what Mailgun expects for a rejected
        // (non-retriable) webhook.
        throw new ApiError('FORBIDDEN', 'Invalid Mailgun webhook signature.');
      }
    } else {
      request.log.warn(
        'SPARX_MAILGUN_WEBHOOK_SIGNING_KEY unset — accepting webhook without verification (dev only)'
      );
    }

    const result = await webhookService.ingest(body['event-data']);
    request.log.info({ result }, 'mailgun webhook ingested');
    return ok(result);
  });

  return Promise.resolve();
};

export default emailWebhookRoutes;
