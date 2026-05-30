'use server';

// Discount + gift card + store credit Server Actions — thin transport
// over @sparx/commerce discountService.

import { revalidatePath } from 'next/cache';

import { discountService } from '@sparx/commerce';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

// ─── Discounts ────────────────────────────────────────────────────────

export async function createDiscountAction(
  input: unknown
): Promise<ActionResult<{ id: string; code: string | null }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await discountService.createDiscount(ctx, input);
    revalidatePath('/commerce/discounts');
    return result;
  });
}

export async function updateDiscountAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await discountService.updateDiscount(ctx, id, input);
    revalidatePath('/commerce/discounts');
    revalidatePath(`/commerce/discounts/${id}`);
    return { ok: true as const };
  });
}

export async function archiveDiscountAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await discountService.archiveDiscount(ctx, id);
    revalidatePath('/commerce/discounts');
    return { ok: true as const };
  });
}

export async function activateDiscountAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await discountService.activateDiscount(ctx, id);
    revalidatePath('/commerce/discounts');
    return { ok: true as const };
  });
}

// ─── Gift cards ───────────────────────────────────────────────────────

export async function issueGiftCardAction(
  input: unknown
): Promise<ActionResult<{ id: string; code: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await discountService.issueGiftCard(ctx, input);
    revalidatePath('/commerce/gift-cards');
    return result;
  });
}

export async function lookupGiftCardAction(
  codeOrId: string
): Promise<ActionResult<Awaited<ReturnType<typeof discountService.lookupGiftCard>>>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    return discountService.lookupGiftCard(ctx, codeOrId);
  });
}

export async function adjustGiftCardAction(
  input: unknown
): Promise<ActionResult<{ newBalanceCents: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await discountService.adjustGiftCard(ctx, input);
    revalidatePath('/commerce/gift-cards');
    return result;
  });
}

// ─── Store credit ─────────────────────────────────────────────────────

export async function grantStoreCreditAction(
  input: unknown
): Promise<ActionResult<{ newBalanceCents: number }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await discountService.grantStoreCredit(ctx, input);
    revalidatePath('/commerce/store-credit');
    return result;
  });
}
