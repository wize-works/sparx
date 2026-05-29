// Testing helpers — used by `vitest` suites in provider packages and the
// integration tests in services/api-rest.

import type { ProviderLogger, ProviderRunContext, SecretReader } from '../context';
import { SecretNotFoundError, noopLogger } from '../context';

export class InMemorySecretReader implements SecretReader {
  private readonly secrets = new Map<string, string>();

  set(ref: string, value: string): void {
    this.secrets.set(ref, value);
  }

  read(secretRef: string): Promise<string> {
    const value = this.secrets.get(secretRef);
    if (!value) return Promise.reject(new SecretNotFoundError(secretRef));
    return Promise.resolve(value);
  }
}

export function makeTestRunContext(
  overrides: Partial<ProviderRunContext> = {}
): ProviderRunContext {
  return {
    tenantId: 'test-tenant-id',
    installationId: 'test-installation-id',
    environment: 'sandbox',
    config: {},
    secrets: new InMemorySecretReader(),
    logger: overrides.logger ?? (noopLogger satisfies ProviderLogger),
    ...overrides,
  };
}
