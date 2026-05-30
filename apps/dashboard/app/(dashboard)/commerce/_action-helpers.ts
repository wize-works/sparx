// Shared types for every Commerce Server Action file.
//
// Now that the actions go through api-rest instead of importing services
// directly, this file only owns the ActionResult envelope shape. The
// error-mapping moved to _rest-action.ts; api-rest enforces the Commerce
// module gate at the route level itself.

import 'server-only';

// Mirrors the platform error envelope from docs/06 §4 so REST and Server
// Actions report the same condition the same way. Discriminated on `ok`;
// callers narrow without instanceof checks. The optional `context` slot
// carries commerce-specific details (variant id for OUT_OF_STOCK, provider
// slug for PROVIDER_ERROR, trace for PRICING_ERROR).
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: { field: string; message: string }[];
        module?: string;
        context?: Record<string, unknown>;
      };
    };
