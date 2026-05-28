'use server';

// CRM Server Actions. These are thin transports — every state-changing
// path delegates to a function in @sparx/crm so REST/GraphQL/MCP share the
// same logic (locked decision #7). The wrapper enforces locked decision #6
// (module gate in middleware): every action runs through requireSession +
// requireModule('crm') before its body executes, so a tenant without CRM
// active gets the documented MODULE_DISABLED envelope rather than a stack
// trace from somewhere deep in the service.

import { revalidatePath } from 'next/cache';

import {
  ModuleDisabledError,
  moduleDisabledEnvelope,
  requireModule,
  requireSession,
} from '@sparx/auth';
import {
  CrmConflictError,
  CrmNotFoundError,
  CrmValidationError,
  activityService,
  customerService,
  dealService,
  taskService,
} from '@sparx/crm';

// ─────────────────────────────────────────────────────────────────────────
// Action envelope — shared shape across every CRM Server Action
// ─────────────────────────────────────────────────────────────────────────
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
        details?: Array<{ field: string; message: string }>;
        module?: string;
      };
    };

async function runAction<T>(handler: () => Promise<T>): Promise<ActionResult<T>> {
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
 *  or an ActionResult-shaped failure envelope when the module is disabled.
 *  Any other auth error (no session) lets requireSession's redirect handle
 *  it — the caller never sees a thrown exception for that path. */
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
    return {
      ok: false,
      error: { code: err.code, message: err.message },
    };
  }
  if (err instanceof CrmValidationError) {
    return {
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
  }
  if (err instanceof CrmConflictError) {
    return {
      ok: false,
      error: { code: err.code, message: err.message },
    };
  }
  // Zod ParseError surfaces a structured `issues` array — surface the first
  // issue so the form can highlight the field.
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues?: Array<{ path: Array<string | number>; message: string }> })
      .issues;
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
  // eslint-disable-next-line no-console
  console.error('CRM action failed', err);
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } };
}

// ─────────────────────────────────────────────────────────────────────────
// Customer actions
// ─────────────────────────────────────────────────────────────────────────

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const customer = await customerService.create(ctx, input);
    revalidatePath('/crm/customers');
    return { id: customer.id };
  });
}

export async function updateCustomerAction(
  customerId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const customer = await customerService.update(ctx, customerId, input);
    revalidatePath('/crm/customers');
    revalidatePath(`/crm/customers/${customerId}`);
    return { id: customer.id };
  });
}

export async function deleteCustomerAction(
  customerId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const customer = await customerService.softDelete(ctx, customerId);
    revalidatePath('/crm/customers');
    return { id: customer.id };
  });
}

export async function mergeCustomersAction(
  input: unknown
): Promise<ActionResult<{ primaryId: string; mergedIds: string[] }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await customerService.merge(ctx, input);
    revalidatePath('/crm');
    revalidatePath('/crm/customers');
    revalidatePath(`/crm/customers/${result.primary.id}`);
    return {
      primaryId: result.primary.id,
      mergedIds: result.merged.map((d) => d.id),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Deal actions
// ─────────────────────────────────────────────────────────────────────────

export async function createDealAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const deal = await dealService.create(ctx, input);
    revalidatePath('/crm/deals');
    revalidatePath(`/crm/pipelines/${deal.pipelineId}`);
    return { id: deal.id };
  });
}

export async function updateDealAction(
  dealId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const deal = await dealService.update(ctx, dealId, input);
    revalidatePath('/crm/deals');
    revalidatePath(`/crm/deals/${dealId}`);
    revalidatePath(`/crm/pipelines/${deal.pipelineId}`);
    return { id: deal.id };
  });
}

/** The only sanctioned stage-change path — goes through dealService.moveStage
 *  so the deal.stage_changed event fires for the email automation engine.
 *  Using updateDealAction with a stageId is rejected at the service layer. */
export async function moveDealStageAction(
  dealId: string,
  input: unknown
): Promise<ActionResult<{ id: string; stageId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const deal = await dealService.moveStage(ctx, dealId, input);
    revalidatePath(`/crm/pipelines/${deal.pipelineId}`);
    revalidatePath(`/crm/deals/${dealId}`);
    return { id: deal.id, stageId: deal.stageId };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Activity + task actions
// ─────────────────────────────────────────────────────────────────────────

export async function recordActivityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const activity = await activityService.record(ctx, input);
    if (activity.customerId) revalidatePath(`/crm/customers/${activity.customerId}`);
    if (activity.dealId) revalidatePath(`/crm/deals/${activity.dealId}`);
    return { id: activity.id };
  });
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const task = await taskService.create(ctx, input);
    revalidatePath('/crm/tasks');
    if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
    if (task.dealId) revalidatePath(`/crm/deals/${task.dealId}`);
    return { id: task.id };
  });
}

export async function completeTaskAction(taskId: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const task = await taskService.complete(ctx, { taskId });
    revalidatePath('/crm/tasks');
    if (task.customerId) revalidatePath(`/crm/customers/${task.customerId}`);
    if (task.dealId) revalidatePath(`/crm/deals/${task.dealId}`);
    return { id: task.id };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Internal — service context with both tenantId and userId. The module gate
// already ran inside runAction's preamble, so by the time this resolves we
// know the session is valid and CRM is enabled.
// ─────────────────────────────────────────────────────────────────────────

async function sessionContext(): Promise<{ tenantId: string; userId: string }> {
  const session = await requireSession();
  return { tenantId: session.user.tenantId, userId: session.user.id };
}
