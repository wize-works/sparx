// Shared helpers for every CRM Server Action file.
//
// Not itself a `'use server'` module — Server Action files (orders-actions,
// quotes-actions, etc.) import these synchronously. The helpers themselves
// still run server-side because they call requireSession / requireModule.

import 'server-only';

import {
  ModuleDisabledError,
  moduleDisabledEnvelope,
  requireModule,
  requireSession,
} from '@sparx/auth';
import { CrmConflictError, CrmNotFoundError, CrmValidationError } from '@sparx/crm';

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

export async function runAction<T>(handler: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const gate = await checkCrmGate();
    if (gate !== null) return gate;
    const data = await handler();
    return { ok: true, data };
  } catch (err) {
    return mapErrorToResult(err);
  }
}

/** Runs requireSession + requireModule('crm') and returns null on success,
 *  or an ActionResult-shaped failure envelope when the module is disabled. */
async function checkCrmGate(): Promise<ActionResult<never> | null> {
  const session = await requireSession();
  try {
    await requireModule(session, 'crm');
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
  if (err instanceof CrmNotFoundError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  if (err instanceof CrmValidationError) {
    return {
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
  }
  if (err instanceof CrmConflictError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  // Zod ParseError surfaces a structured `issues` array — surface the first
  // issue so the form can highlight the field.
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

  console.error('CRM action failed', err);
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } };
}

/** Service context with both tenantId and userId. The module gate already
 *  ran inside runAction's preamble, so by the time this resolves we know
 *  the session is valid and CRM is enabled. */
export async function sessionContext(): Promise<{ tenantId: string; userId: string }> {
  const session = await requireSession();
  return { tenantId: session.user.tenantId, userId: session.user.id };
}
