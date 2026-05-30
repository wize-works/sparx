// Shared wrapper for the migrated Commerce Server Actions. Same shape as
// the CRM equivalent — folds api-rest errors into the platform
// `ActionResult` envelope, including commerce-specific codes like
// OUT_OF_STOCK, PRICING_ERROR, and PROVIDER_ERROR. Details from the api-rest
// envelope are mapped onto `error.context` for those codes so existing
// form components keep their recovery paths.

import 'server-only';

import type { ApiRestError } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';

export async function restAction<T>(handler: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await handler();
    return { ok: true, data };
  } catch (err) {
    return mapRestError(err);
  }
}

export function mapRestError(err: unknown): ActionResult<never> {
  const restErr = err as ApiRestError;
  const code = restErr.code ?? 'INTERNAL_ERROR';
  const message = restErr.message ?? 'Unexpected error';
  const raw = restErr.details;

  // Validation errors carry an array of {field,message}; everything else
  // carries an object the form can surface as commerce-specific context.
  if (Array.isArray(raw)) {
    return {
      ok: false,
      error: { code, message, details: raw as { field: string; message: string }[] },
    };
  }
  if (raw && typeof raw === 'object') {
    return {
      ok: false,
      error: { code, message, context: raw as Record<string, unknown> },
    };
  }
  return { ok: false, error: { code, message } };
}
