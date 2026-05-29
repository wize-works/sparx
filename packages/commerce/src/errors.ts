// Service-layer error vocabulary. Every transport (REST, GraphQL, Server
// Actions, MCP) maps these to its native envelope so a 404 from the
// service surfaces as a 404 HTTP status, a GraphQLError with code
// 'NOT_FOUND', and an { ok:false, error:{ code:'NOT_FOUND', ... } }
// envelope from a Server Action — all in one place.

import type { TenantContext } from '@sparx/db';

export type ServiceContext = TenantContext;

export class CommerceNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  readonly entityType: string;
  readonly entityId: string;
  constructor(entityType: string, entityId: string) {
    super(`${entityType} ${entityId} not found`);
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export class CommerceValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly details: { field: string; message: string }[];
  constructor(message: string, details: { field: string; message: string }[] = []) {
    super(message);
    this.details = details;
  }
}

export class CommerceConflictError extends Error {
  readonly code = 'CONFLICT' as const;
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

// Out-of-stock / inventory-policy violations. Distinct from a generic
// 422 because the storefront has a specific recovery path: surface a
// "wait-list me" or "swap to back-orderable variant" CTA.
export class CommerceOutOfStockError extends Error {
  readonly code = 'OUT_OF_STOCK' as const;
  readonly variantId: string;
  readonly requested: number;
  readonly available: number;
  constructor(variantId: string, requested: number, available: number) {
    super(`Variant ${variantId} out of stock (requested ${requested}, available ${available})`);
    this.variantId = variantId;
    this.requested = requested;
    this.available = available;
  }
}

// Pricing pipeline rejected a discount/gift-card/store-credit application
// because a precondition was unmet. The pricing trace explains why.
export class CommercePricingError extends Error {
  readonly code = 'PRICING_ERROR' as const;
  readonly reason: string;
  readonly trace?: unknown;
  constructor(reason: string, trace?: unknown) {
    super(reason);
    this.reason = reason;
    this.trace = trace;
  }
}

// Provider call failed in a way the merchant has to resolve. Distinct
// from a transient network error (which the worker retries) — provider
// errors surface to the merchant dashboard for manual action.
export class CommerceProviderError extends Error {
  readonly code = 'PROVIDER_ERROR' as const;
  readonly providerSlug: string;
  readonly providerErrorCode?: string;
  readonly retryable: boolean;
  constructor(
    providerSlug: string,
    message: string,
    opts: { providerErrorCode?: string; retryable?: boolean } = {}
  ) {
    super(message);
    this.providerSlug = providerSlug;
    this.providerErrorCode = opts.providerErrorCode;
    this.retryable = opts.retryable ?? false;
  }
}

// Aliased exports so transports can write `import type { NotFoundError }
// from '@sparx/commerce'` without dragging the implementation class
// names through their code.
export type NotFoundError = CommerceNotFoundError;
export type ValidationError = CommerceValidationError;
export type ConflictError = CommerceConflictError;
export type OutOfStockError = CommerceOutOfStockError;
export type PricingError = CommercePricingError;
export type ProviderError = CommerceProviderError;
