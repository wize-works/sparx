'use server';

// Quote Server Actions — create / update / item mutations + lifecycle.
//
// Lifecycle transitions (submit / accept / decline / expire / convert)
// each emit a CRM event the email automation engine subscribes to.
// convertToOrder additionally emits the platform `order.created` event
// (atomic snapshot of items at conversion time) — see
// quote-lifecycle-service.ts.

import { revalidatePath } from 'next/cache';

import { quoteService, quoteLifecycleService } from '@sparx/crm';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

export async function createQuoteAction(
  input: unknown
): Promise<ActionResult<{ id: string; quoteNumber: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const quote = await quoteService.create(ctx, input);
    revalidatePath('/crm/quotes');
    if (quote.customerId) revalidatePath(`/crm/customers/${quote.customerId}`);
    return { id: quote.id, quoteNumber: quote.quoteNumber };
  });
}

export async function updateQuoteAction(
  quoteId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const quote = await quoteService.update(ctx, quoteId, input);
    revalidatePath('/crm/quotes');
    revalidatePath(`/crm/quotes/${quoteId}`);
    return { id: quote.id };
  });
}

export async function addQuoteItemAction(
  input: unknown
): Promise<ActionResult<{ id: string; quoteId: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const item = await quoteService.addItem(ctx, input);
    revalidatePath(`/crm/quotes/${item.quoteId}`);
    return { id: item.id, quoteId: item.quoteId };
  });
}

export async function removeQuoteItemAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await quoteService.removeItem(ctx, input);
    revalidatePath('/crm/quotes');
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Lifecycle transitions
// ─────────────────────────────────────────────────────────────────────────

export async function submitQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const quote = await quoteLifecycleService.submit(ctx, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function acceptQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const quote = await quoteLifecycleService.accept(ctx, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function declineQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const quote = await quoteLifecycleService.decline(ctx, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function expireQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const quote = await quoteLifecycleService.expire(ctx, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function convertQuoteAction(
  input: unknown
): Promise<ActionResult<{ quoteId: string; orderId: string; orderNumber: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const { quote, order } = await quoteLifecycleService.convertToOrder(ctx, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    revalidatePath(`/crm/orders/${order.id}`);
    revalidatePath('/crm/orders');
    if (order.customerId) revalidatePath(`/crm/customers/${order.customerId}`);
    return { quoteId: quote.id, orderId: order.id, orderNumber: order.orderNumber };
  });
}
