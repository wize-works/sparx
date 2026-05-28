// Per-message handler. Pure function so integration tests can drive it
// without spinning up a Pub/Sub subscription.
//
// Flow:
//   1. Validate the parsed event shape with zod.
//   2. Render the named template (subject + html + text).
//   3. Send via the configured transport (Postal or Console).
//   4. Return an outcome the caller persists to the audit table.
//
// Failure model — three categories:
//   - PermanentSendError / UnknownTemplateError / render mismatch
//       → outcome.status = 'rejected', ack the message, no retry.
//   - Unknown / network / 5xx
//       → throw, caller nacks the message and Pub/Sub retries (up to
//         the subscription's max_delivery_attempts before DLQ).

import type { Logger } from 'pino';
import { z } from 'zod';
import { render, UnknownTemplateError } from './templates.js';
import { getTransport, PermanentSendError } from './transport.js';
import { env } from './env.js';

const StringOrArray = z.union([z.string(), z.array(z.string()).min(1)]);

const EmailSendPayload = z.object({
  to: StringOrArray,
  cc: StringOrArray.optional(),
  bcc: StringOrArray.optional(),
  template: z.string().min(1),
  vars: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  from: z.string().optional(),
  replyTo: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const EmailSendEvent = z.object({
  type: z.literal('email.send'),
  tenantId: z.string().min(1),
  actorId: z.string().nullable(),
  occurredAt: z.string(),
  data: EmailSendPayload,
});

export type EmailSendEvent = z.infer<typeof EmailSendEvent>;

export interface HandleOutcome {
  status: 'sent' | 'rejected';
  messageId: string;
  recipient: string;
  errorMessage?: string;
}

export function parseEvent(raw: unknown): EmailSendEvent | null {
  const result = EmailSendEvent.safeParse(raw);
  return result.success ? result.data : null;
}

export async function handle(event: EmailSendEvent, logger: Logger): Promise<HandleOutcome> {
  const childLog = logger.child({
    tenantId: event.tenantId,
    template: event.data.template,
  });

  // Normalise to arrays so transports don't have to handle both shapes.
  const to = toArray(event.data.to);
  const cc = event.data.cc ? toArray(event.data.cc) : undefined;
  const bcc = event.data.bcc ? toArray(event.data.bcc) : undefined;

  try {
    const rendered = render(event.data.template, event.data.vars);
    const result = await getTransport().send(
      {
        from: event.data.from ?? env.EMAIL_FROM,
        to,
        cc,
        bcc,
        replyTo: event.data.replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        headers: event.data.headers,
      },
      childLog
    );
    return {
      status: 'sent',
      messageId: result.messageId,
      recipient: result.recipient || (to[0] ?? ''),
    };
  } catch (err) {
    if (isPermanent(err)) {
      childLog.warn({ err }, 'email rejected (permanent) — acking');
      return {
        status: 'rejected',
        messageId: '',
        recipient: to[0] ?? '',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
    // Transient — re-throw so the caller nacks the Pub/Sub message and
    // it gets redelivered.
    throw err;
  }
}

function toArray(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

function isPermanent(err: unknown): boolean {
  return (
    err instanceof PermanentSendError ||
    err instanceof UnknownTemplateError ||
    // Handlebars throws when a `{{var}}` references a missing key under
    // strict mode. Detect by class name to avoid a Handlebars import here.
    (err instanceof Error && err.name === 'Handlebars: Lookup of property')
  );
}
