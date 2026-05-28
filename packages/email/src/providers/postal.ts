import type { EmailProvider, SendableEmail } from '../types';

// Postal HTTP provider — POSTs to Postal's /api/v1/send/message endpoint.
// Postal is self-hosted (docs/13 §1) and lives on `sparx.email` once it is
// deployed; until then `SPARX_EMAIL_PROVIDER=console` is the dev default and
// this code only fires when explicitly opted in.

export interface PostalConfig {
  /** Base URL of the Postal server, e.g. https://postal.sparx.email */
  baseUrl: string;
  /** Server API key issued by Postal for this credential. */
  apiKey: string;
}

/**
 * Postal rejected the request based on the message itself — invalid
 * recipient, missing required header, suppressed address, etc. The
 * caller should NOT retry; the same payload will fail again.
 *
 * email-worker treats this as a permanent send failure (acks the Pub/Sub
 * message instead of nacking). The console provider never throws this.
 */
export class PostalParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostalParameterError';
  }
}

interface PostalSendResponse {
  status: 'success' | 'error' | 'parameter-error';
  data?: {
    message_id?: string;
    messages?: Record<string, { id: number; token: string }>;
  };
  message?: string;
}

export function createPostalProvider(config: PostalConfig): EmailProvider {
  return {
    name: 'postal',
    async send(email: SendableEmail) {
      const url = `${config.baseUrl.replace(/\/$/, '')}/api/v1/send/message`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-server-api-key': config.apiKey,
        },
        body: JSON.stringify({
          to: [email.to],
          from: email.from,
          reply_to: email.replyTo,
          subject: email.subject,
          html_body: email.html,
          plain_body: email.text,
          tag: email.templateId,
          headers: email.tags
            ? Object.fromEntries(Object.entries(email.tags).map(([k, v]) => [`x-sparx-${k}`, v]))
            : undefined,
        }),
      });

      if (!res.ok) {
        // Network / 5xx / auth — transient from the worker's POV. Plain
        // Error → email-worker nacks → Pub/Sub redelivers.
        throw new Error(`Postal rejected send (${res.status} ${res.statusText})`);
      }

      const body = (await res.json()) as PostalSendResponse;
      if (body.status === 'parameter-error') {
        // The message itself is the problem (bad recipient, suppressed
        // address, missing required header). Retrying won't help; surface
        // as a typed error so email-worker can ack instead of redelivering.
        throw new PostalParameterError(body.message ?? 'Postal rejected message parameters');
      }
      if (body.status !== 'success') {
        throw new Error(`Postal error: ${body.message ?? 'unknown'}`);
      }

      const messageId =
        body.data?.message_id ?? Object.values(body.data?.messages ?? {})[0]?.token ?? '';

      return {
        id: messageId || `postal_${Date.now().toString(36)}`,
        provider: 'postal',
        acceptedAt: new Date().toISOString(),
      };
    },
  };
}
