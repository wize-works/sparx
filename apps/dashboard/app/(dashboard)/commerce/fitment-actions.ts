'use server';

// Fitment Server Actions — thin transport over @sparx/commerce fitmentService.

import { revalidatePath } from 'next/cache';

import { fitmentService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

// Lazy reads — drive the tree's expand-on-click without round-tripping
// through a separate REST surface.

export async function listVehicleModelsAction(
  makeId: string
): Promise<ActionResult<Awaited<ReturnType<typeof fitmentService.listModels>>>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    return fitmentService.listModels(ctx, makeId);
  });
}

export async function listVehicleEnginesAction(
  modelId: string
): Promise<ActionResult<Awaited<ReturnType<typeof fitmentService.listEngines>>>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    return fitmentService.listEngines(ctx, modelId);
  });
}

// Reference data writes — fit into the per-tenant override flow on top
// of platform-seeded makes/models/engines.

export async function createVehicleMakeAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await fitmentService.createMake(ctx, input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function createVehicleModelAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await fitmentService.createModel(ctx, input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

export async function createVehicleEngineAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await fitmentService.createEngine(ctx, input);
    revalidatePath('/commerce/fitment');
    return result;
  });
}

// Per-product fitment writes.

export async function setProductFitmentAction(
  productId: string,
  fitments: unknown[]
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await fitmentService.setForProduct(ctx, productId, fitments as never);
    revalidatePath(`/commerce/products/${productId}`);
    return { ok: true as const };
  });
}

export async function bulkAssignFitmentAction(
  input: unknown
): Promise<ActionResult<{ rowsAffected: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await fitmentService.bulkAssign(ctx, input);
    revalidatePath('/commerce/products');
    return result;
  });
}

export async function deleteFitmentAction(
  productId: string,
  fitmentId: string
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await fitmentService.deleteFitment(ctx, fitmentId);
    revalidatePath(`/commerce/products/${productId}`);
    return { id: fitmentId };
  });
}
