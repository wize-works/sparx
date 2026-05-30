// Service-layer error types (mirrors @sparx/crm errors).
//
// Each transport maps these to its native error envelope:
//   - REST: HTTP status (404 / 422 / 409)
//   - MCP: tool-result error with the same code shape
//   - Server Actions: { ok: false, error: {...} } envelope
//
// Keeping the error vocabulary at the service layer means every transport
// reports the same condition the same way without re-deriving HTTP codes
// from generic exceptions.

import type { TenantContext } from '@sparx/db';

export type ServiceContext = TenantContext;

export class EmailNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  readonly entityType: string;
  readonly entityId: string;
  constructor(entityType: string, entityId: string) {
    super(`${entityType} ${entityId} not found`);
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export class EmailValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly details: { field: string; message: string }[];
  constructor(message: string, details: { field: string; message: string }[] = []) {
    super(message);
    this.details = details;
  }
}

export class EmailConflictError extends Error {
  readonly code = 'CONFLICT' as const;
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

// Raised when an external provider (Mailgun) rejects a request in a way the
// merchant needs to see (e.g. domain already exists, invalid domain). Distinct
// from a transient 5xx, which should bubble as a plain Error and retry.
export class EmailProviderError extends Error {
  readonly code = 'PROVIDER_ERROR' as const;
  readonly provider: string;
  readonly status?: number;
  constructor(provider: string, message: string, status?: number) {
    super(message);
    this.provider = provider;
    this.status = status;
  }
}

// Aliased exports so transports can write `import type { NotFoundError }` etc.
export type NotFoundError = EmailNotFoundError;
export type ValidationError = EmailValidationError;
