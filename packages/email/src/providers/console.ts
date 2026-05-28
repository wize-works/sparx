import type { EmailProvider } from '../types';

// Dev provider — logs the rendered email to stdout and stashes the last send
// in-memory so tests / a debug UI can assert on it. Never used in production;
// SPARX_EMAIL_PROVIDER selects between this and the Postal HTTP provider.

let lastSend: ConsoleSend | null = null;

export interface ConsoleSend {
  id: string;
  to: string;
  from: string;
  subject: string;
  templateId?: string;
  html: string;
  text: string;
  acceptedAt: string;
}

export const consoleProvider: EmailProvider = {
  name: 'console',
  // eslint-disable-next-line @typescript-eslint/require-await
  async send(email) {
    const id = `con_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const acceptedAt = new Date().toISOString();

    lastSend = {
      id,
      to: email.to,
      from: email.from,
      subject: email.subject,
      templateId: email.templateId,
      html: email.html,
      text: email.text,
      acceptedAt,
    };

    // Compact, single-line summary by default; the text body follows as a
    // separate stdout line so reading dev logs is bearable. Set
    // SPARX_EMAIL_LOG_HTML=1 if you want the full HTML dumped too.
    console.log(
      `[email/console] ${email.templateId ?? 'unknown'} → ${email.to} :: ${email.subject}`
    );
    if (process.env.SPARX_EMAIL_LOG_HTML === '1') {
      console.log(email.html);
    } else {
      console.log(email.text);
    }

    return { id, provider: 'console', acceptedAt };
  },
};

export function lastConsoleSend(): ConsoleSend | null {
  return lastSend;
}

export function resetConsoleProvider(): void {
  lastSend = null;
}
