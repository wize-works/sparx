// Provider-bundle bootstrap. Runs once per process to populate the
// integration-framework registry and tell @sparx/commerce where to
// resolve install secrets. Idempotent: createApp() can be called many
// times in tests without double-register errors.
//
// New providers register here. Tests can skip this by calling
// `_resetRegistryForTest()` and re-registering with stubbed bundles.

import { setSecretReader, envSecretReader, mapSecretReader } from '@sparx/commerce';
import { SecretNotFoundError, type SecretReader } from '@sparx/integration-framework';
import { registerStripeProviders } from '@sparx/provider-stripe';
import { registerShippoProviders } from '@sparx/provider-shippo';

let booted = false;

export function bootstrapProviders(): void {
  if (booted) return;
  booted = true;

  try {
    registerStripeProviders();
  } catch (err) {
    // "Provider already registered" — fine, another caller beat us to
    // it (HMR, parallel test setup). Anything else is a real bug.
    if (!(err instanceof Error) || !/already registered/i.test(err.message)) throw err;
  }
  try {
    registerShippoProviders();
  } catch (err) {
    if (!(err instanceof Error) || !/already registered/i.test(err.message)) throw err;
  }

  setSecretReader(buildSecretReader());
}

/** env: refs hit process.env directly. projects/… refs hit Google Secret
 *  Manager via lazy import — the dep is optional so this service can
 *  run without GCP creds in development. */
function buildSecretReader(): SecretReader {
  const env = envSecretReader();
  let gsmClient: { accessSecretVersion: (req: { name: string }) => Promise<unknown> } | null = null;

  return {
    async read(ref: string): Promise<string> {
      if (ref.startsWith('env:')) return env.read(ref);
      if (ref.startsWith('projects/')) {
        if (!gsmClient) {
          const mod = (await import('@google-cloud/secret-manager').catch(() => null)) as {
            SecretManagerServiceClient: new () => typeof gsmClient;
          } | null;
          if (!mod) {
            throw new SecretNotFoundError(
              `${ref} (install @google-cloud/secret-manager to enable GSM secret resolution)`
            );
          }
          gsmClient = new mod.SecretManagerServiceClient();
        }
        const [response] = (await gsmClient!.accessSecretVersion({ name: ref })) as [
          { payload?: { data?: Buffer | Uint8Array | string } },
        ];
        const data = response?.payload?.data;
        if (!data) throw new SecretNotFoundError(ref);
        return typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
      }
      throw new SecretNotFoundError(ref);
    },
  };
}

/** Test-only escape hatch: swap the registry's secret resolution for
 *  fixed values. */
export function _setTestSecrets(entries: Record<string, string>): void {
  setSecretReader(mapSecretReader(entries));
}
