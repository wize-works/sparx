// Auth-side email event publisher. Wraps @sparx/events so Better Auth
// callbacks (sendResetPassword, sendVerificationEmail when wired) can
// emit typed `email.send` events with one call.
//
// Logger: we don't have a request-scoped Fastify logger here (Better
// Auth runs inside the dashboard Next.js process, not Fastify), so this
// uses console as a minimal shim. The actual rendering + send happens
// inside email-worker, which has its own pino logger.

import {
  createPublisher,
  publishEvent,
  type EmailSendPayload,
  type PublisherLogger,
} from '@sparx/events';

const logger: PublisherLogger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', ...obj, msg })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', ...obj, msg })),
  error: (obj, msg) => console.error(JSON.stringify({ level: 'error', ...obj, msg })),
};

export interface PublishAuthEmailInput {
  tenantId: string;
  actorId: string | null;
  /** Restricted to the templates auth flows actually trigger today. */
  template: 'password-reset' | 'welcome-merchant';
  to: string;
  /** Template-specific props — shape enforced at render time by @sparx/email. */
  props: Record<string, unknown>;
  from?: string;
  replyTo?: string;
}

export async function publishAuthEmail(input: PublishAuthEmailInput): Promise<void> {
  const publisher = createPublisher({
    projectId: process.env.GCP_PROJECT_ID,
    logger,
  });

  const payload: EmailSendPayload = {
    to: input.to,
    template: input.template,
    props: input.props,
    from: input.from,
    replyTo: input.replyTo,
  };

  await publishEvent(publisher, 'email.send', input.tenantId, input.actorId, payload, logger);
}
