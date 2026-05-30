// Server-only provider registration. Imported once from the
// providers/* pages so the integration-framework registry has every
// concrete provider bundle available before providerService.listAvailable
// runs. Idempotent — duplicate import is a no-op once the registry
// rejects re-registration.

import 'server-only';

import { registerAvalaraProviders } from '@sparx/provider-avalara';
import { registerEasypostProviders } from '@sparx/provider-easypost';
import { registerPaypalProviders } from '@sparx/provider-paypal';
import { registerShippoProviders } from '@sparx/provider-shippo';
import { registerStripeProviders } from '@sparx/provider-stripe';
import { registerTaxjarProviders } from '@sparx/provider-taxjar';

let registered = false;

export function ensureProvidersRegistered(): void {
  if (registered) return;
  registered = true;
  // Each register*() throws if a slug is already taken — wrap so a
  // hot-reload double-import doesn't crash the route.
  safeRegister(registerStripeProviders);
  safeRegister(registerShippoProviders);
  safeRegister(registerTaxjarProviders);
  safeRegister(registerEasypostProviders);
  safeRegister(registerAvalaraProviders);
  safeRegister(registerPaypalProviders);
}

function safeRegister(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // Already-registered errors are expected on hot reload; other
    // errors deserve attention.
    if (err instanceof Error && err.message.startsWith('Provider already registered')) {
      return;
    }
    console.error('Provider registration failed', err);
  }
}
