// Deal input schemas.
//
// docs/11 §4. A deal lives on a pipeline + stage, optionally linked to a
// customer and/or a B2B account, and connects to orders/quotes via the
// join tables (deal_orders, deal_quotes) — never via columns on those
// tables. See locked decision #5 in memory/feedback_crm_architecture.md.

import { z } from 'zod';

import { TagList, Uuid } from './common.js';

export const CreateDealInput = z.object({
  pipelineId: Uuid,
  stageId: Uuid,
  customerId: Uuid.nullable().optional(),
  b2bAccountId: Uuid.nullable().optional(),
  assignedRepId: Uuid.nullable().optional(),
  title: z.string().min(1).max(255),
  value: z.number().min(0).max(999_999_999_999.99).default(0),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'Currency must be ISO 4217 (e.g. "USD")')
    .default('USD'),
  probability: z.number().min(0).max(100).default(0),
  expectedCloseDate: z.string().date().nullable().optional(),
  source: z.string().max(63).nullable().optional(),
  tags: TagList.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CreateDealInput = z.infer<typeof CreateDealInput>;

export const UpdateDealInput = CreateDealInput.partial();
export type UpdateDealInput = z.infer<typeof UpdateDealInput>;

// Stage moves are a separate write path because they emit deal.stage_changed
// to Pub/Sub — the email module's automations key off this event. Going
// through the generic UpdateDeal path would skip that side effect.
export const MoveDealStageInput = z.object({
  toStageId: Uuid,
  // Optional: closedReason captured when moving to a won/lost terminal stage.
  closedReason: z.string().max(500).optional(),
});
export type MoveDealStageInput = z.infer<typeof MoveDealStageInput>;

// Order/quote attachment — pure join-table operations.
export const AttachDealOrderInput = z.object({
  dealId: Uuid,
  orderId: Uuid,
});
export type AttachDealOrderInput = z.infer<typeof AttachDealOrderInput>;

export const AttachDealQuoteInput = z.object({
  dealId: Uuid,
  quoteId: Uuid,
});
export type AttachDealQuoteInput = z.infer<typeof AttachDealQuoteInput>;
