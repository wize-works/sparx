// SecretReader registry. providerService.runPayment-style calls need a
// SecretReader to decrypt installation credentials before invoking the
// concrete provider bundle. The reader is a process-wide singleton set
// by the host (api-rest, workers) at boot:
//
//   import { setSecretReader } from '@sparx/commerce';
//   setSecretReader(myReader);
//
// Tests inject a mapSecretReader directly. Dev defaults to env-only
// (`env:STRIPE_SECRET_KEY` style refs), which keeps `pnpm dev` working
// without any GCP credentials.

import { SecretNotFoundError, type SecretReader } from '@sparx/integration-framework';

export function envSecretReader(): SecretReader {
  return {
    read(ref: string): Promise<string> {
      if (!ref.startsWith('env:')) {
        throw new SecretNotFoundError(ref);
      }
      const name = ref.slice('env:'.length);
      const value = process.env[name];
      if (!value) throw new SecretNotFoundError(ref);
      return Promise.resolve(value);
    },
  };
}

export function mapSecretReader(entries: Record<string, string>): SecretReader {
  return {
    read(ref: string): Promise<string> {
      if (ref in entries) return Promise.resolve(entries[ref]!);
      return Promise.reject(new SecretNotFoundError(ref));
    },
  };
}

let activeReader: SecretReader = envSecretReader();

export function setSecretReader(reader: SecretReader): void {
  activeReader = reader;
}

export function getSecretReader(): SecretReader {
  return activeReader;
}
