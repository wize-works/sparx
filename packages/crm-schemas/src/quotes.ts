// CRM — Quote input schemas.
//
// Full quote lifecycle: draft → submitted → (accepted | declined | expired |
// converted). Accepted quotes convert to an Order via convertToOrder — the
// service stamps the pointer + status + activity in a single transaction.

import { z } from 'zod';

import { Currency, LineItemInput, Money } from './common-commerce';
import { PaymentTerms } from './common';
import { Uuid } from './common';

export const QuoteStatus = z.enum([
  'draft',
  'submitted',
  'accepted',
  'declined',
  'expired',
  'converted',
]);
export type QuoteStatus = z.infer<typeof QuoteStatus>;

// At least one of customerId / b2bAccountId must be set. The CRM layer
// expects both (B2B quote with a primary contact) or just one (B2B-only or
// retail quote).
const QuoteAnchor = z
  .object({
    customerId: Uuid.nullable().optional(),
    b2bAccountId: Uuid.nullable().optional(),
  })
  .refine((v) => v.customerId != null || v.b2bAccountId != null, {
    message: 'Quote must anchor to a customer or a B2B account',
  });

export const CreateQuoteInput = QuoteAnchor.and(
  z.object({
    quoteNumber: z.string().min(1).max(63).optional(),
    currency: Currency.default('USD'),
    shippingTotal: Money.default(0),
    discountTotal: Money.default(0),
    // If omitted, derived from per-line taxAmounts.
    taxTotal: Money.optional(),
    paymentTerms: PaymentTerms.optional(),
    validUntil: z.string().datetime().optional(),
    customerNote: z.string().max(10_000).optional(),
    internalNote: z.string().max(10_000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    items: z.array(LineItemInput).min(1).max(500),
  })
);
export type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;

// Header-only update. State transitions go through dedicated submit /
// accept / decline / expire methods. Items use addQuoteItem /
// updateQuoteItem / removeQuoteItem on a draft quote.
export const UpdateQuoteInput = z.object({
  customerNote: z.string().max(10_000).nullable().optional(),
  internalNote: z.string().max(10_000).nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  paymentTerms: PaymentTerms.nullable().optional(),
  shippingTotal: Money.optional(),
  discountTotal: Money.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateQuoteInput = z.infer<typeof UpdateQuoteInput>;

export const ListQuotesInput = z.object({
  customerId: Uuid.optional(),
  b2bAccountId: Uuid.optional(),
  status: QuoteStatus.optional(),
  expiringBefore: z.string().datetime().optional(),
  q: z.string().max(255).optional(),
  take: z.number().int().min(1).max(250).default(50),
  skip: z.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'total', 'validUntil', 'updatedAt']).default('createdAt'),
});
export type ListQuotesInput = z.infer<typeof ListQuotesInput>;

export const SubmitQuoteInput = z.object({ quoteId: Uuid });
export type SubmitQuoteInput = z.infer<typeof SubmitQuoteInput>;

export const AcceptQuoteInput = z.object({ quoteId: Uuid });
export type AcceptQuoteInput = z.infer<typeof AcceptQuoteInput>;

export const DeclineQuoteInput = z.object({
  quoteId: Uuid,
  reason: z.string().max(500).optional(),
});
export type DeclineQuoteInput = z.infer<typeof DeclineQuoteInput>;

export const ExpireQuoteInput = z.object({ quoteId: Uuid });
export type ExpireQuoteInput = z.infer<typeof ExpireQuoteInput>;

// Convert an accepted quote to an Order. The service enforces:
//   • quote.status === 'accepted'
//   • quote.customerId != null (or fallback to a customer on the B2B account)
//   • a fresh Order row is created with snapshot fields copied from the quote
export const ConvertQuoteInput = z.object({
  quoteId: Uuid,
  // Optional override of the customer on the resulting order (e.g. for B2B
  // quotes anchored only to a b2bAccount).
  customerId: Uuid.optional(),
  orderNumber: z.string().min(1).max(63).optional(),
  channel: z.string().max(63).optional(),
});
export type ConvertQuoteInput = z.infer<typeof ConvertQuoteInput>;

// QuoteItem mutations on a draft quote.
export const AddQuoteItemInput = z.object({ quoteId: Uuid, item: LineItemInput });
export type AddQuoteItemInput = z.infer<typeof AddQuoteItemInput>;

export const UpdateQuoteItemInput = z.object({
  itemId: Uuid,
  patch: LineItemInput.partial(),
});
export type UpdateQuoteItemInput = z.infer<typeof UpdateQuoteItemInput>;

export const RemoveQuoteItemInput = z.object({ itemId: Uuid });
export type RemoveQuoteItemInput = z.infer<typeof RemoveQuoteItemInput>;
