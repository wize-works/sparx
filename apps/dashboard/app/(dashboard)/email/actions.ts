'use server';

import { z } from 'zod';
import { api, type ApiRestError } from '@/lib/api-rest-client';

// Test-send action for /email. Now forwards to api-rest
// (`POST /v1/email/test-send`, `GET /v1/email/last-console-send`) — the
// dashboard doesn't import `@sparx/email` anymore.

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
  const parsed = TestSendSchema.safeParse({
    to: typeof formData.get('to') === 'string' ? formData.get('to') : '',
    template:
      typeof formData.get('template') === 'string' ? formData.get('template') : 'welcome-merchant',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    const send = await api.post<{
      id: string;
      provider: string;
      acceptedAt: string;
      templateId: string;
      to: string;
    }>('/v1/email/test-send', parsed.data);
    return { ok: true, send };
  } catch (err) {
    return {
      ok: false,
      error: (err as ApiRestError).message ?? 'Send failed.',
    };
  }
}

// Shape mirrors `lastConsoleSend()` from @sparx/email — kept here so the
// /email page UI stays unchanged. The provider type is wide on purpose;
// production runs return null for non-console providers.
export interface ConsoleSend {
  id: string;
  provider: string;
  acceptedAt: string;
  to: string | string[];
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  template?: string;
  props?: Record<string, unknown>;
}

export interface DevLastSend {
  enabled: boolean;
  send: ConsoleSend | null;
}

export async function readLastDevSend(): Promise<DevLastSend> {
  return api.get<DevLastSend>('/v1/email/last-console-send');
}
