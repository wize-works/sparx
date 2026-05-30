'use server';

// Pricing Server Actions — thin transport over @sparx/commerce
// pricingService. Covers price lists, entries, bulk tiers, and contract
// prices.

import { revalidatePath } from 'next/cache';

import { pricingService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

// ─── Price lists ──────────────────────────────────────────────────────

export async function createPriceListAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await pricingService.createPriceList(ctx, input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function updatePriceListAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await pricingService.updatePriceList(ctx, id, input);
    revalidatePath('/commerce/pricing');
    revalidatePath(`/commerce/pricing/${id}`);
    return { ok: true as const };
  });
}

export async function archivePriceListAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await pricingService.archivePriceList(ctx, id);
    revalidatePath('/commerce/pricing');
    return { ok: true as const };
  });
}

// ─── Price list entries ──────────────────────────────────────────────

export async function setPriceListEntryAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await pricingService.setPriceListEntry(ctx, input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function deletePriceListEntryAction(
  entryId: string,
  priceListId: string
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await pricingService.deletePriceListEntry(ctx, entryId);
    revalidatePath(`/commerce/pricing/${priceListId}`);
    return { ok: true as const };
  });
}

// ─── Bulk tiers ──────────────────────────────────────────────────────

export async function createBulkTierAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await pricingService.createBulkTier(ctx, input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function deleteBulkTierAction(tierId: string): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await pricingService.deleteBulkTier(ctx, tierId);
    revalidatePath('/commerce/pricing');
    return { ok: true as const };
  });
}

// ─── Contract prices ─────────────────────────────────────────────────

export async function createContractPriceAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await pricingService.createContractPrice(ctx, input);
    revalidatePath('/commerce/pricing');
    return result;
  });
}

export async function deleteContractPriceAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await pricingService.deleteContractPrice(ctx, id);
    revalidatePath('/commerce/pricing');
    return { ok: true as const };
  });
}
