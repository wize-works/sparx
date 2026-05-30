'use server';

import { revalidatePath } from 'next/cache';

import { taxService } from '@sparx/commerce';
import type {
  CreateTaxExemptionInput,
  CreateTaxRateInput,
  CreateTaxZoneInput,
} from '@sparx/commerce-schemas';

import { runAction, sessionContext, type ActionResult } from './_action-helpers';

// ─── Zones ───────────────────────────────────────────────────────────

export async function createTaxZoneAction(
  input: CreateTaxZoneInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await taxService.createZone(ctx, input);
    revalidatePath('/commerce/tax');
    return result;
  });
}

export async function updateTaxZoneAction(
  id: string,
  input: Partial<CreateTaxZoneInput>
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await taxService.updateZone(ctx, id, input);
    revalidatePath('/commerce/tax');
    revalidatePath(`/commerce/tax/zones/${id}`);
  });
}

export async function deleteTaxZoneAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await taxService.deleteZone(ctx, id);
    revalidatePath('/commerce/tax');
  });
}

// ─── Rates ───────────────────────────────────────────────────────────

export async function createTaxRateAction(
  input: CreateTaxRateInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await taxService.createRate(ctx, input);
    revalidatePath(`/commerce/tax/zones/${input.zoneId}`);
    return result;
  });
}

export async function deleteTaxRateAction(id: string, zoneId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await taxService.deleteRate(ctx, id);
    revalidatePath(`/commerce/tax/zones/${zoneId}`);
  });
}

// ─── Exemptions ──────────────────────────────────────────────────────

export async function createTaxExemptionAction(
  input: CreateTaxExemptionInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await taxService.createExemption(ctx, input);
    revalidatePath('/commerce/tax');
    return result;
  });
}

export async function deleteTaxExemptionAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await taxService.deleteExemption(ctx, id);
    revalidatePath('/commerce/tax');
  });
}
