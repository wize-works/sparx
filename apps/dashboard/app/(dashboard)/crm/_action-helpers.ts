// Shared types for every CRM Server Action file.
//
// Now that the actions go through api-rest instead of importing services
// directly, this file only owns the ActionResult envelope shape. The
// error-mapping + module-gate logic moved to _rest-action.ts; api-rest
// enforces the CRM module gate at the route level itself.

import 'server-only';

// Mirrors the platform error envelope from docs/06 §4 so REST and Server
// Actions report the same condition the same way. The discriminated union
// on `ok` lets callers narrow without instanceof checks.
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: { field: string; message: string }[];
        module?: string;
      };
    };
