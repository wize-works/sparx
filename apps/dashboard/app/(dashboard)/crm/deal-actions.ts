'use server';

// Deal Server Actions — adapters over api-rest /v1/crm/deals + deal-attachments.
//
// moveStage is the only sanctioned stage-change path; api-rest's
// /v1/crm/deals/:id/move-stage endpoint goes through dealService.moveStage
// so the crm.deal.stage_changed event still fires for the email automation
// engine. updateDealAction with a stageId is rejected at the service layer.

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

interface DealResponse {
  id: string;
  pipelineId: string;
  stageId: string;
}

interface DealOrderLink {
  dealId: string;
  orderId: string;
}

interface DealQuoteLink {
  dealId: string;
  quoteId: string;
}

interface AttachOrderInputShape {
  dealId: string;
  orderId: string;
}

interface AttachQuoteInputShape {
  dealId: string;
  quoteId: string;
}

export async function createDealAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const deal = await api.post<DealResponse>('/v1/crm/deals', input);
    revalidatePath('/crm/deals');
    revalidatePath(`/crm/pipelines/${deal.pipelineId}`);
    return { id: deal.id };
  });
}

export async function updateDealAction(
  dealId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const deal = await api.patch<DealResponse>(`/v1/crm/deals/${dealId}`, input);
    revalidatePath('/crm/deals');
    revalidatePath(`/crm/deals/${dealId}`);
    revalidatePath(`/crm/pipelines/${deal.pipelineId}`);
    return { id: deal.id };
  });
}

export async function moveDealStageAction(
  dealId: string,
  input: unknown
): Promise<ActionResult<{ id: string; stageId: string }>> {
  return restAction(async () => {
    const deal = await api.post<DealResponse>(`/v1/crm/deals/${dealId}/move-stage`, input);
    revalidatePath(`/crm/pipelines/${deal.pipelineId}`);
    revalidatePath(`/crm/deals/${dealId}`);
    return { id: deal.id, stageId: deal.stageId };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Join-table operations (locked decision #5) — attach/detach orders + quotes
// via the REST nested endpoints. Body is snake_case per the platform contract;
// the dashboard caller can keep its camelCase props and we transform here.
// ─────────────────────────────────────────────────────────────────────────

export async function attachOrderToDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; orderId: string }>> {
  return restAction(async () => {
    const { dealId, orderId } = input as AttachOrderInputShape;
    const link = await api.post<DealOrderLink>(`/v1/crm/deals/${dealId}/orders`, {
      order_id: orderId,
    });
    revalidatePath(`/crm/deals/${link.dealId}`);
    revalidatePath(`/crm/orders/${link.orderId}`);
    return { dealId: link.dealId, orderId: link.orderId };
  });
}

export async function detachOrderFromDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; orderId: string }>> {
  return restAction(async () => {
    const { dealId, orderId } = input as AttachOrderInputShape;
    await api.delete<void>(`/v1/crm/deals/${dealId}/orders/${orderId}`);
    revalidatePath(`/crm/deals/${dealId}`);
    revalidatePath(`/crm/orders/${orderId}`);
    return { dealId, orderId };
  });
}

export async function attachQuoteToDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; quoteId: string }>> {
  return restAction(async () => {
    const { dealId, quoteId } = input as AttachQuoteInputShape;
    const link = await api.post<DealQuoteLink>(`/v1/crm/deals/${dealId}/quotes`, {
      quote_id: quoteId,
    });
    revalidatePath(`/crm/deals/${link.dealId}`);
    revalidatePath(`/crm/quotes/${link.quoteId}`);
    return { dealId: link.dealId, quoteId: link.quoteId };
  });
}

export async function detachQuoteFromDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; quoteId: string }>> {
  return restAction(async () => {
    const { dealId, quoteId } = input as AttachQuoteInputShape;
    await api.delete<void>(`/v1/crm/deals/${dealId}/quotes/${quoteId}`);
    revalidatePath(`/crm/deals/${dealId}`);
    revalidatePath(`/crm/quotes/${quoteId}`);
    return { dealId, quoteId };
  });
}
