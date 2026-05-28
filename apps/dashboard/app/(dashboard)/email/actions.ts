'use server';

import { sendTemplate, lastConsoleSend, type ConsoleSend } from '@sparx/email';
import { z } from 'zod';
import { requireSession } from '@sparx/auth';

// Test-send action for /email. Lets an authed staff user fire either of the
// shipping templates at any recipient — useful for QAing both the rendering
// and the provider wiring (console in dev, Postal in prod). All sends are
// audit-logged via the provider; nothing tenant-scoped writes to the DB.

const TestSendSchema = z.object({
  to: z.string().email('Enter a valid recipient email.'),
  template: z.enum(['welcome-merchant', 'password-reset']),
});

export interface TestSendResult {
  ok: boolean;
  error?: string;
  send?: {
    id: string;
    provider: string;
    acceptedAt: string;
    templateId: string;
    to: string;
  };
}

export async function sendTestEmail(formData: FormData): Promise<TestSendResult> {
  const { user } = await requireSession();

  const parsed = TestSendSchema.safeParse({
    to: typeof formData.get('to') === 'string' ? formData.get('to') : '',
    template:
      typeof formData.get('template') === 'string' ? formData.get('template') : 'welcome-merchant',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    let result;
    if (parsed.data.template === 'welcome-merchant') {
      result = await sendTemplate({
        template: 'welcome-merchant',
        to: parsed.data.to,
        props: {
          name: user.name ?? undefined,
          storeName: 'Your Sparx store',
          dashboardUrl:
            (process.env.BETTER_AUTH_URL ?? 'http://localhost:3001').replace(/\/$/, '') +
            '/welcome',
        },
      });
    } else {
      result = await sendTemplate({
        template: 'password-reset',
        to: parsed.data.to,
        props: {
          name: user.name ?? undefined,
          resetUrl: 'https://example.test/reset?token=test-token',
          expiresInMinutes: 60,
        },
      });
    }

    return {
      ok: true,
      send: {
        id: result.id,
        provider: result.provider,
        acceptedAt: result.acceptedAt,
        templateId: parsed.data.template,
        to: parsed.data.to,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Send failed.',
    };
  }
}

export interface DevLastSend {
  enabled: boolean;
  send: ConsoleSend | null;
}

export async function readLastDevSend(): Promise<DevLastSend> {
  await requireSession();
  const provider = (process.env.SPARX_EMAIL_PROVIDER ?? 'console').toLowerCase();
  if (provider !== 'console') {
    return { enabled: false, send: null };
  }
  return { enabled: true, send: lastConsoleSend() };
}
