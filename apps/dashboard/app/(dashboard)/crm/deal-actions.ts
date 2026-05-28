'use server';

// Deal Server Actions — create / update / moveStage + attach/detach joins.
//
// moveStage is the only sanctioned stage-change path; it goes through
// dealService.moveStage so the crm.deal.stage_changed event fires for the
// email automation engine. updateDealAction with a stageId is rejected at
// the service layer.

import { revalidatePath } from 'next/cache';

import { dealService } from '@sparx/crm';
import { AttachDealOrderInput, AttachDealQuoteInput } from '@sparx/crm-schemas';

import { type ActionResult, runAction, sessionContext } from './_action-helpers';

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
// Join-table operations (locked decision #5) — attach/detach orders + quotes.
// The service layer takes positional args; we validate the inbound payload
// here against the Zod schemas in @sparx/crm-schemas before delegating.
// ─────────────────────────────────────────────────────────────────────────

export async function attachOrderToDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; orderId: string }>> {
  return runAction(async () => {
    const args = AttachDealOrderInput.parse(input);
    const ctx = await sessionContext();
    const link = await dealService.attachOrder(ctx, args);
    revalidatePath(`/crm/deals/${link.dealId}`);
    revalidatePath(`/crm/orders/${link.orderId}`);
    return { dealId: link.dealId, orderId: link.orderId };
  });
}

export async function detachOrderFromDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; orderId: string }>> {
  return runAction(async () => {
    const args = AttachDealOrderInput.parse(input);
    const ctx = await sessionContext();
    await dealService.detachOrder(ctx, args);
    revalidatePath(`/crm/deals/${args.dealId}`);
    revalidatePath(`/crm/orders/${args.orderId}`);
    return { dealId: args.dealId, orderId: args.orderId };
  });
}

export async function attachQuoteToDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; quoteId: string }>> {
  return runAction(async () => {
    const args = AttachDealQuoteInput.parse(input);
    const ctx = await sessionContext();
    const link = await dealService.attachQuote(ctx, args);
    revalidatePath(`/crm/deals/${link.dealId}`);
    revalidatePath(`/crm/quotes/${link.quoteId}`);
    return { dealId: link.dealId, quoteId: link.quoteId };
  });
}

export async function detachQuoteFromDealAction(
  input: unknown
): Promise<ActionResult<{ dealId: string; quoteId: string }>> {
  return runAction(async () => {
    const args = AttachDealQuoteInput.parse(input);
    const ctx = await sessionContext();
    await dealService.detachQuote(ctx, args);
    revalidatePath(`/crm/deals/${args.dealId}`);
    revalidatePath(`/crm/quotes/${args.quoteId}`);
    return { dealId: args.dealId, quoteId: args.quoteId };
  });
}
