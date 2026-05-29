// Context object every provider call receives. Carries enough for a
// provider to address the right tenant + installation, log events, and
// resolve secrets — without coupling the provider package to @sparx/db
// or any particular logger implementation.

export interface ProviderRunContext {
  /** Tenant the call is acting on behalf of. RLS context, audit-log
   *  attribution, and webhook routing all derive from this. */
  tenantId: string;
  /** ID of the installation row in commerce_provider_installations. A
   *  tenant can have several installations of the same provider (e.g.
   *  Stripe sandbox + Stripe production), so the slug alone isn't a key. */
  installationId: string;
  /** `sandbox` vs `production`. Resolved by the provider service so the
   *  provider doesn't have to inspect config. */
  environment: 'sandbox' | 'production';
  /** Tenant-scoped configuration resolved from
   *  `commerce_provider_installations.config_encrypted` after decryption.
   *  Schema is validated against the provider's metadata.configSchemaJson
   *  before the call. */
  config: Record<string, unknown>;
  /** Tenant-scoped secret accessors. Concrete implementations resolve
   *  Google Secret Manager refs; tests inject a Map-backed loader. */
  secrets: SecretReader;
  /** Optional logger; defaults to a noop. */
  logger?: ProviderLogger;
  /** Optional idempotency key forwarded to the provider when the call
   *  is part of a critical path (charge, label purchase, refund). */
  idempotencyKey?: string;
}

export interface SecretReader {
  /** Returns the resolved secret value or throws SecretNotFoundError. */
  read(secretRef: string): Promise<string>;
}

export class SecretNotFoundError extends Error {
  readonly code = 'SECRET_NOT_FOUND' as const;
  readonly secretRef: string;
  constructor(secretRef: string) {
    super(`Secret ${secretRef} not found`);
    this.secretRef = secretRef;
  }
}

export interface ProviderLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

function noop(): void {
  /* no-op */
}

export const noopLogger: ProviderLogger = {
  info: noop,
  warn: noop,
  error: noop,
};
