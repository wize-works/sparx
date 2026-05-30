// Shared wrapper for Email Server Actions — mirrors the CRM `restAction`
// pattern but kept module-local so /email never imports from /crm. Folds any
// api-rest error into the platform ActionResult shape the form components read.

import 'server-only';

import type { ApiRestError } from '@/lib/api-rest-client';

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: { code: string; message: string; details?: { field: string; message: string }[] };
    };

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
  const details = Array.isArray(restErr.details)
    ? (restErr.details as { field: string; message: string }[])
    : undefined;
  return {
    ok: false,
    error: {
      code: restErr.code ?? 'INTERNAL_ERROR',
      message: restErr.message ?? 'Unexpected error',
      ...(details ? { details } : {}),
    },
  };
}
