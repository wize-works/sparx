// Outbound email transport.
//
// Two implementations follow the same shape as media-worker's storage
// backends — abstract interface + cached singleton selected by env at
// boot. The split exists so the worker can be deployed and exercised
// before Postal is up: an unset POSTAL_API_KEY falls through to
// ConsoleTransport which logs the rendered email instead of relaying it.
//
// Once Postal is up, populate POSTAL_API_KEY + POSTAL_API_BASE in
// sparx-app-secrets / sparx-app-env, restart the pods, and the worker
// auto-switches to PostalTransport without a code change.

import type { Logger } from 'pino';
import { env } from './env.js';

export interface SendRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  // Postal's `MessageDetails.id` (numeric) stringified. Empty for console
  // transport — we still want an audit row, we just have nothing to cite.
  messageId: string;
  // Echoed back so the caller can store it on the outcome row without
  // re-deriving from the request.
  recipient: string;
}

// Recipient was rejected before relay (suppressed, hard-bounce history,
// malformed). Ack the Pub/Sub message — retrying won't help.
export class PermanentSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSendError';
  }
}

export interface EmailTransport {
  readonly mode: 'postal' | 'console';
  send(request: SendRequest, logger: Logger): Promise<SendResult>;
}

// ────────────────────────────────────────────────────────────────────────
// Console transport (Phase-1 default; selected when POSTAL_API_KEY unset)
// ────────────────────────────────────────────────────────────────────────

class ConsoleTransport implements EmailTransport {
  readonly mode = 'console' as const;

  send(request: SendRequest, logger: Logger): Promise<SendResult> {
    logger.info(
      {
        transport: 'console',
        from: request.from,
        to: request.to,
        subject: request.subject,
        htmlBytes: request.html.length,
        textBytes: request.text.length,
      },
      'email rendered (console transport — not relayed)'
    );
    return Promise.resolve({
      messageId: '',
      recipient: request.to[0] ?? '',
    });
  }
}

// ────────────────────────────────────────────────────────────────────────
// Postal HTTP transport
// ────────────────────────────────────────────────────────────────────────

interface PostalSendResponse {
  status: 'success' | 'parameter-error' | 'error';
  // Present on success — keyed by recipient address.
  data?: Record<
    string,
    {
      id: number;
      token: string;
    }
  >;
  // Present on non-success.
  message?: string;
}

class PostalTransport implements EmailTransport {
  readonly mode = 'postal' as const;
  private readonly base: string;
  private readonly apiKey: string;

  constructor(base: string, apiKey: string) {
    // Postal's HTTP API lives under /api/v1/send. We accept either form
    // (with or without trailing slash) and normalise.
    this.base = base.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  async send(request: SendRequest, logger: Logger): Promise<SendResult> {
    const body = {
      from: request.from,
      to: request.to,
      cc: request.cc,
      bcc: request.bcc,
      reply_to: request.replyTo,
      subject: request.subject,
      html_body: request.html,
      plain_body: request.text,
      headers: request.headers,
    };

    const response = await fetch(`${this.base}/api/v1/send/message`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-server-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    // Postal returns 200 for both successes AND parameter errors; the
    // distinction is in the JSON `status` field. Non-2xx HTTP is a
    // transport-level failure (Postal down, network) — treat as transient.
    if (!response.ok) {
      throw new Error(`Postal HTTP ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as PostalSendResponse;

    if (payload.status === 'parameter-error') {
      // Bad input — permanent. Examples: invalid recipient, suppressed
      // address, missing required header.
      throw new PermanentSendError(payload.message ?? 'Postal rejected parameters');
    }

    if (payload.status !== 'success' || !payload.data) {
      throw new Error(`Postal returned non-success: ${payload.message ?? 'unknown'}`);
    }

    // Postal returns one entry per recipient. We cite the first; the
    // others are recorded as separate audit rows by the caller if/when
    // we want per-recipient tracking.
    const firstRecipient = Object.keys(payload.data)[0] ?? request.to[0] ?? '';
    const firstDelivery = firstRecipient ? payload.data[firstRecipient] : undefined;

    logger.info(
      {
        transport: 'postal',
        recipients: Object.keys(payload.data).length,
        postalMessageId: firstDelivery?.id,
      },
      'email relayed via Postal'
    );

    return {
      messageId: firstDelivery ? String(firstDelivery.id) : '',
      recipient: firstRecipient,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────
// Module-level singleton
// ────────────────────────────────────────────────────────────────────────

let cached: EmailTransport | null = null;

export function getTransport(): EmailTransport {
  if (cached) return cached;
  if (env.POSTAL_API_KEY && env.POSTAL_API_BASE) {
    cached = new PostalTransport(env.POSTAL_API_BASE, env.POSTAL_API_KEY);
  } else {
    cached = new ConsoleTransport();
  }
  return cached;
}

// Test hook — let integration suites swap in a mock and reset between
// cases. Not used in production paths.
export function _resetTransportForTest(): void {
  cached = null;
}
