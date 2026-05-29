// Provider-side error vocabulary. Concrete providers throw these so the
// platform can decide whether to retry, surface to the merchant, or
// fail the transaction.

export class ProviderConfigurationError extends Error {
  readonly code = 'PROVIDER_CONFIGURATION_ERROR' as const;
  readonly providerSlug: string;
  readonly fields: string[];
  constructor(providerSlug: string, message: string, fields: string[] = []) {
    super(message);
    this.providerSlug = providerSlug;
    this.fields = fields;
  }
}

export class ProviderUnsupportedError extends Error {
  readonly code = 'PROVIDER_UNSUPPORTED' as const;
  readonly providerSlug: string;
  readonly capability: string;
  constructor(providerSlug: string, capability: string) {
    super(`Provider ${providerSlug} does not support ${capability}`);
    this.providerSlug = providerSlug;
    this.capability = capability;
  }
}

export class ProviderTransientError extends Error {
  readonly code = 'PROVIDER_TRANSIENT' as const;
  readonly providerSlug: string;
  readonly retryAfterSeconds?: number;
  constructor(providerSlug: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.providerSlug = providerSlug;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ProviderHardError extends Error {
  readonly code = 'PROVIDER_HARD_ERROR' as const;
  readonly providerSlug: string;
  readonly providerErrorCode?: string;
  constructor(providerSlug: string, message: string, providerErrorCode?: string) {
    super(message);
    this.providerSlug = providerSlug;
    this.providerErrorCode = providerErrorCode;
  }
}

export class WebhookVerificationError extends Error {
  readonly code = 'WEBHOOK_VERIFICATION_FAILED' as const;
  readonly providerSlug: string;
  constructor(providerSlug: string, message: string) {
    super(message);
    this.providerSlug = providerSlug;
  }
}
