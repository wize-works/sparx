// Service-layer error types.
//
// Each transport maps these to its native error envelope:
//   - REST: HTTP status (404 / 422 / 409)
//   - GraphQL: GraphQLError with extensions.code
//   - Server Actions: { ok: false, error: {...} } envelope
//   - MCP: tool-result error with the same code shape
//
// Keeping the error vocabulary at the service layer means every transport
// reports the same condition the same way without re-deriving HTTP codes
// from generic exceptions.

import type { TenantContext } from '@sparx/db';

export type ServiceContext = TenantContext;

export class CrmNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  readonly entityType: string;
  readonly entityId: string;
  constructor(entityType: string, entityId: string) {
    super(`${entityType} ${entityId} not found`);
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export class CrmValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly details: Array<{ field: string; message: string }>;
  constructor(message: string, details: Array<{ field: string; message: string }> = []) {
    super(message);
    this.details = details;
  }
}

export class CrmConflictError extends Error {
  readonly code = 'CONFLICT' as const;
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

// Aliased exports so transports can write `import type { NotFoundError }` etc.
// without dragging the implementation class names through their code.
export type NotFoundError = CrmNotFoundError;
export type ValidationError = CrmValidationError;
