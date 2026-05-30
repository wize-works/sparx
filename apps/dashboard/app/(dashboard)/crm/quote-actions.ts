'use server';

// Quote Server Actions — adapters over api-rest /v1/crm/quotes.
//
// Lifecycle transitions (submit / accept / decline / expire / convert)
// each emit a CRM event the email automation engine subscribes to.
// convertToOrder additionally emits the platform `order.created` event
// (atomic snapshot of items at conversion time) — see
// quote-lifecycle-service.ts.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface QuoteResponse {
  id: string;
  quoteNumber: string;
  customerId: string | null;
}

interface QuoteItemResponse {
  id: string;
  quoteId: string;
}

interface ConvertResponse {
  quote: { id: string };
  order: { id: string; orderNumber: string; customerId: string | null };
}

export async function createQuoteAction(
  input: unknown
): Promise<ActionResult<{ id: string; quoteNumber: string }>> {
  return restAction(async () => {
    const quote = await api.post<QuoteResponse>('/v1/crm/quotes', input);
    revalidatePath('/crm/quotes');
    if (quote.customerId) revalidatePath(`/crm/customers/${quote.customerId}`);
    return { id: quote.id, quoteNumber: quote.quoteNumber };
  });
}

export async function updateQuoteAction(
  quoteId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const quote = await api.patch<QuoteResponse>(`/v1/crm/quotes/${quoteId}`, input);
    revalidatePath('/crm/quotes');
    revalidatePath(`/crm/quotes/${quoteId}`);
    return { id: quote.id };
  });
}

export async function addQuoteItemAction(
  input: unknown
): Promise<ActionResult<{ id: string; quoteId: string }>> {
  return restAction(async () => {
    const { quoteId } = input as { quoteId: string };
    const item = await api.post<QuoteItemResponse>(`/v1/crm/quotes/${quoteId}/items`, input);
    revalidatePath(`/crm/quotes/${item.quoteId}`);
    return { id: item.id, quoteId: item.quoteId };
  });
}

export async function removeQuoteItemAction(input: unknown): Promise<ActionResult<void>> {
  return restAction(async () => {
    const { quoteId, itemId } = input as { quoteId: string; itemId: string };
    await api.delete<void>(`/v1/crm/quotes/${quoteId}/items/${itemId}`);
    revalidatePath('/crm/quotes');
    revalidatePath(`/crm/quotes/${quoteId}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Lifecycle transitions
// ─────────────────────────────────────────────────────────────────────────

export async function submitQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const { quoteId } = input as { quoteId: string };
    const quote = await api.post<QuoteResponse>(`/v1/crm/quotes/${quoteId}/submit`, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function acceptQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const { quoteId } = input as { quoteId: string };
    const quote = await api.post<QuoteResponse>(`/v1/crm/quotes/${quoteId}/accept`, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function declineQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const { quoteId } = input as { quoteId: string };
    const quote = await api.post<QuoteResponse>(`/v1/crm/quotes/${quoteId}/decline`, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function expireQuoteAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const { quoteId } = input as { quoteId: string };
    const quote = await api.post<QuoteResponse>(`/v1/crm/quotes/${quoteId}/expire`, input);
    revalidatePath(`/crm/quotes/${quote.id}`);
    return { id: quote.id };
  });
}

export async function convertQuoteAction(
  input: unknown
): Promise<ActionResult<{ quoteId: string; orderId: string; orderNumber: string }>> {
  return restAction(async () => {
    const { quoteId } = input as { quoteId: string };
    const { quote, order } = await api.post<ConvertResponse>(
      `/v1/crm/quotes/${quoteId}/convert-to-order`,
      input
    );
    revalidatePath(`/crm/quotes/${quote.id}`);
    revalidatePath(`/crm/orders/${order.id}`);
    revalidatePath('/crm/orders');
    if (order.customerId) revalidatePath(`/crm/customers/${order.customerId}`);
    return { quoteId: quote.id, orderId: order.id, orderNumber: order.orderNumber };
  });
}
