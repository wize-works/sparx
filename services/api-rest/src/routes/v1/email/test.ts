// Email test-send + console-send introspection.
//
//   POST /v1/email/test-send                 → fire a template at an address
//   GET  /v1/email/last-console-send         → dev-only: last console send
//
// Synchronous-send escape hatch — see CLAUDE.md "Outbound email defaults to
// publishing email.send to Pub/Sub". The test-send tool is exactly the case
// the doc allows: a staff-triggered smoke test for the template + provider
// wiring, where waiting on a worker tick would defeat the purpose. The
// long-term plan is a separate `email.send` event surface for the regular
// transactional path.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sendTemplate, lastConsoleSend } from '@sparx/email';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';

const TestSendBody = z.object({
  to: z.string().email(),
  template: z.enum(['welcome-merchant', 'password-reset']),
  userName: z.string().min(1).max(255).optional(),
  storeName: z.string().min(1).max(255).optional(),
  dashboardUrl: z.string().url().optional(),
  resetUrl: z.string().url().optional(),
  expiresInMinutes: z
    .number()
    .int()
    .min(1)
    .max(60 * 24)
    .optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync type demands async; no top-level await needed because route registration is sync.
const emailTestRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/email/test-send', async (request) => {
    const auth = requireRole(request, 'admin');
    const input = TestSendBody.parse(request.body);

    let result;
    if (input.template === 'welcome-merchant') {
      result = await sendTemplate({
        template: 'welcome-merchant',
        to: input.to,
        props: {
          name: input.userName,
          storeName: input.storeName ?? 'Your Sparx store',
          dashboardUrl:
            input.dashboardUrl ??
            (process.env.BETTER_AUTH_URL ?? 'http://localhost:3001').replace(/\/$/, '') +
              '/welcome',
        },
      });
    } else {
      result = await sendTemplate({
        template: 'password-reset',
        to: input.to,
        props: {
          name: input.userName,
          resetUrl: input.resetUrl ?? 'https://example.test/reset?token=test-token',
          expiresInMinutes: input.expiresInMinutes ?? 60,
        },
      });
    }

    request.log.info(
      {
        tenantId: auth.tenantId,
        template: input.template,
        to: input.to,
        provider: result.provider,
      },
      'email test-send'
    );

    return ok({
      id: result.id,
      provider: result.provider,
      acceptedAt: result.acceptedAt,
      templateId: input.template,
      to: input.to,
    });
  });

  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify route handlers may be async or sync; this one is sync but matches the surrounding async signature.
  app.get('/v1/email/last-console-send', async (request) => {
    requireRole(request, 'admin');
    const provider = (process.env.SPARX_EMAIL_PROVIDER ?? 'console').toLowerCase();
    if (provider !== 'console') {
      return ok({ enabled: false, send: null });
    }
    return ok({ enabled: true, send: lastConsoleSend() });
  });
};

export default emailTestRoutes;
