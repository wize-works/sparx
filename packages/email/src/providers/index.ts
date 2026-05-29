import type { EmailProvider } from '../types';
import { consoleProvider } from './console';
import { createMailgunProvider } from './mailgun';
import { createPostalProvider } from './postal';

// Picks the active provider from SPARX_EMAIL_PROVIDER (defaults to console).
// Production runs on Mailgun:
//   SPARX_EMAIL_PROVIDER=mailgun
//   SPARX_MAILGUN_API_KEY=<account API key>
//   SPARX_MAILGUN_DOMAIN=sparx.email            (default sending domain)
//   SPARX_MAILGUN_REGION=us                     (us|eu, default us)
// Dev + CI stay on the console provider so tests can assert on the last
// send out of memory without hitting the network.
//
// The Postal provider is retained for the smoke-test / fallback path during
// the Mailgun cutover; it's not the production default anymore. See
// project_email_architecture memory for the rationale.

export {
  consoleProvider,
  lastConsoleSend,
  resetConsoleProvider,
  type ConsoleSend,
} from './console';
export { createMailgunProvider, MailgunParameterError, type MailgunConfig } from './mailgun';
export { createPostalProvider, PostalParameterError, type PostalConfig } from './postal';

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;

  const choice = (process.env.SPARX_EMAIL_PROVIDER ?? 'console').toLowerCase();

  if (choice === 'mailgun') {
    const apiKey = process.env.SPARX_MAILGUN_API_KEY;
    const defaultDomain = process.env.SPARX_MAILGUN_DOMAIN;
    if (!apiKey || !defaultDomain) {
      throw new Error(
        'SPARX_EMAIL_PROVIDER=mailgun requires SPARX_MAILGUN_API_KEY and SPARX_MAILGUN_DOMAIN.'
      );
    }
    const region = (process.env.SPARX_MAILGUN_REGION ?? 'us').toLowerCase();
    if (region !== 'us' && region !== 'eu') {
      throw new Error(`SPARX_MAILGUN_REGION must be 'us' or 'eu', got '${region}'.`);
    }
    cached = createMailgunProvider({ apiKey, defaultDomain, region });
    return cached;
  }

  if (choice === 'postal') {
    const baseUrl = process.env.SPARX_POSTAL_URL;
    const apiKey = process.env.SPARX_POSTAL_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error(
        'SPARX_EMAIL_PROVIDER=postal requires SPARX_POSTAL_URL and SPARX_POSTAL_API_KEY.'
      );
    }
    cached = createPostalProvider({ baseUrl, apiKey });
    return cached;
  }

  cached = consoleProvider;
  return cached;
}

/** Test seam — swap the provider in unit/integration tests. */
export function _setEmailProvider(provider: EmailProvider | null): void {
  cached = provider;
}
