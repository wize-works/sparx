// Shared wrapper for the migrated CRM Server Actions. Standard pattern:
//
//   export async function fooAction(input: unknown) {
//     return restAction(async () => {
//       const data = await api.post('/v1/crm/things', input);
//       revalidatePath('/crm/things');
//       return { id: data.id };
//     });
//   }
//
// All errors that surface from api-rest are caught and folded into the
// platform `ActionResult` shape. The shape matches what the original
// service-layer-direct actions returned, so callers (form components,
// dashboard panels) don't need to change.

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
