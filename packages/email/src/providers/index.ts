import type { EmailProvider } from '../types';
import { consoleProvider } from './console';
import { createPostalProvider } from './postal';

// Picks the active provider from SPARX_EMAIL_PROVIDER (defaults to console).
// In production, set:
//   SPARX_EMAIL_PROVIDER=postal
//   SPARX_POSTAL_URL=https://postal.sparx.email
//   SPARX_POSTAL_API_KEY=<server-api-key>
// In dev + CI we stay on the console provider so tests can read the last send
// out of memory without standing up Postal.

export {
  consoleProvider,
  lastConsoleSend,
  resetConsoleProvider,
  type ConsoleSend,
} from './console';
export { createPostalProvider, type PostalConfig } from './postal';

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;

  const choice = (process.env.SPARX_EMAIL_PROVIDER ?? 'console').toLowerCase();

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
