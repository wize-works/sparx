// Shared helpers for every Commerce Server Action file.
//
// Not itself a `'use server'` module — Server Action files (products,
// inventory, pricing, etc.) import these synchronously. The helpers
// themselves still run server-side because they call requireSession /
// requireModule.
//
// Mirrors apps/dashboard/app/(dashboard)/crm/_action-helpers.ts. The
// CommerceProviderError + CommerceOutOfStockError + CommercePricingError
// surfaces are commerce-specific additions to the base envelope.

import 'server-only';

import {
  ModuleDisabledError,
  moduleDisabledEnvelope,
  requireModule,
  requireSession,
} from '@sparx/auth';
import {
  CommerceConflictError,
  CommerceNotFoundError,
  CommerceOutOfStockError,
  CommercePricingError,
  CommerceProviderError,
  CommerceValidationError,
} from '@sparx/commerce';

// Mirrors the platform error envelope from docs/06 §4 so REST and
// Server Actions report the same condition the same way. Discriminated
// on `ok`; callers narrow without instanceof checks.
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: { field: string; message: string }[];
        module?: string;
        /** Variant id for OUT_OF_STOCK; provider slug for PROVIDER_ERROR. */
        context?: Record<string, unknown>;
      };
    };

export async function runAction<T>(handler: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const gate = await checkCommerceGate();
    if (gate !== null) return gate;
    const data = await handler();
    return { ok: true, data };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/** Runs requireSession + requireModule('commerce'). Returns null on
 *  success, or an ActionResult-shaped failure envelope when the module
 *  is disabled. */
async function checkCommerceGate(): Promise<ActionResult<never> | null> {
  const session = await requireSession();
  try {
    await requireModule(session, 'commerce');
    return null;
  } catch (err) {
    if (err instanceof ModuleDisabledError) {
      const env = moduleDisabledEnvelope(err);
      return { ok: false, error: { ...env.error, message: env.error.message } };
    }
    throw err;
  }
}

function mapErrorToResult(err: unknown): ActionResult<never> {
  if (err instanceof ModuleDisabledError) {
    const env = moduleDisabledEnvelope(err);
    return { ok: false, error: { ...env.error, message: env.error.message } };
  }
  if (err instanceof CommerceNotFoundError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  if (err instanceof CommerceValidationError) {
    return {
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
  }
  if (err instanceof CommerceConflictError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        context: err.field ? { field: err.field } : undefined,
      },
    };
  }
  if (err instanceof CommerceOutOfStockError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        context: {
          variantId: err.variantId,
          requested: err.requested,
          available: err.available,
        },
      },
    };
  }
  if (err instanceof CommercePricingError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        context: err.trace ? { trace: err.trace } : undefined,
      },
    };
  }
  if (err instanceof CommerceProviderError) {
    return {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        context: {
          providerSlug: err.providerSlug,
          providerErrorCode: err.providerErrorCode,
          retryable: err.retryable,
        },
      },
    };
  }
  // Zod ParseError surfaces a structured `issues` array — bubble up the
  // first issue so the form can highlight the offending field.
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues;
    if (issues && issues.length > 0) {
      const first = issues[0]!;
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: first.message,
          details: issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      };
    }
  }

  console.error('Commerce action failed', err);
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } };
}

/** Service context with tenantId + userId. The module gate already ran
 *  inside runAction's preamble, so by the time this resolves we know
 *  the session is valid and Commerce is enabled. */
export async function sessionContext(): Promise<{ tenantId: string; userId: string }> {
  const session = await requireSession();
  return { tenantId: session.user.tenantId, userId: session.user.id };
}
