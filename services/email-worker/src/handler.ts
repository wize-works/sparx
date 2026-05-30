// Per-message handler. Pure function so integration tests can drive it
// without spinning up a Pub/Sub subscription.
//
// Flow:
//   1. Validate the parsed event shape with zod against TemplateSend.
//   2. renderTemplate(input) from @sparx/email — returns html + plaintext.
//   3. getEmailProvider().send(rendered) — console or Postal depending on
//      SPARX_EMAIL_PROVIDER + POSTAL_API_KEY (selection happens inside
//      @sparx/email's providers/index.ts).
//
// Failure model — three categories:
//   - Unknown template id / zod parse failure
//       → outcome.status = 'rejected', ack the message, no retry.
//   - Provider rejects (4xx / suppressed / parameter error)
//       → outcome.status = 'rejected', ack, no retry.
//   - Provider transient (5xx / network / Postal down)
//       → throw, caller nacks and Pub/Sub redelivers.

import type { Logger } from 'pino';
import { z } from 'zod';
import {
  getEmailProvider,
  MailgunParameterError,
  PostalParameterError,
  renderTemplate,
} from '@sparx/email';

const TemplateSendSchema = z.discriminatedUnion('template', [
  z.object({
    template: z.literal('password-reset'),
    to: z.string().email(),
    from: z.string().optional(),
    replyTo: z.string().optional(),
    props: z.object({
      name: z.string().optional(),
      resetUrl: z.string().url(),
      expiresInMinutes: z.number().int().positive().optional(),
    }),
  }),
  z.object({
    template: z.literal('welcome-merchant'),
    to: z.string().email(),
    from: z.string().optional(),
    replyTo: z.string().optional(),
    props: z.object({
      name: z.string().optional(),
      storeName: z.string().min(1),
      dashboardUrl: z.string().url(),
    }),
  }),
]);

const EmailSendEvent = z.object({
  type: z.literal('email.send'),
  tenantId: z.string().min(1),
  actorId: z.string().nullable(),
  occurredAt: z.string(),
  data: TemplateSendSchema,
});

export type EmailSendEvent = z.infer<typeof EmailSendEvent>;

export interface HandleOutcome {
  status: 'sent' | 'rejected';
  /** Provider's external id (Postal message id, or `con_*` in dev). */
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

  try {
    const rendered = await renderTemplate(event.data);
    // Stamp the tenant onto the message as a Mailgun user variable so the
    // webhook receiver can attribute delivery/engagement events back to it
    // (works even on the shared sending domain, where From doesn't identify
    // the merchant). Broadcast/automation ids ride in event.data later.
    const result = await getEmailProvider().send({
      ...rendered,
      variables: { ...rendered.variables, tenant_id: event.tenantId },
    });
    return {
      status: 'sent',
      messageId: result.id,
      recipient: event.data.to,
    };
  } catch (err) {
    if (isPermanent(err)) {
      childLog.warn({ err }, 'email rejected (permanent) — acking');
      return {
        status: 'rejected',
        messageId: '',
        recipient: event.data.to,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
    // Transient — re-throw so the caller nacks and Pub/Sub redelivers.
    throw err;
  }
}

function isPermanent(err: unknown): boolean {
  // Provider-typed parameter-error classes — retrying won't help. Console
  // provider can't fail with anything that isn't a code bug (which we
  // WANT to surface, not silently ack), so only explicit provider
  // rejections count as permanent here.
  return err instanceof MailgunParameterError || err instanceof PostalParameterError;
}
