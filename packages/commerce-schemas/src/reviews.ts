// Product reviews + Q&A + wishlist.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

export const ReviewRating = z.number().int().min(1).max(5);
export type ReviewRating = z.infer<typeof ReviewRating>;

export const SubmitReviewInput = z.object({
  productId: Uuid,
  variantId: Uuid.optional(),
  customerId: Uuid.optional(), // anonymous reviews allowed when null
  orderId: Uuid.optional(), // populated → verified-purchase badge
  rating: ReviewRating,
  title: z.string().min(1).max(127),
  body: z.string().min(1).max(10_000),
  mediaAssetIds: z.array(Uuid).max(10).default([]),
  displayName: z.string().max(63).optional(), // overrides customer name
});
export type SubmitReviewInput = z.infer<typeof SubmitReviewInput>;

export const ReviewModerationStatus = z.enum(['pending', 'approved', 'rejected', 'flagged']);
export type ReviewModerationStatus = z.infer<typeof ReviewModerationStatus>;

export const ModerateReviewInput = z.object({
  reviewId: Uuid,
  status: ReviewModerationStatus,
  moderationNote: z.string().max(2000).optional(),
});
export type ModerateReviewInput = z.infer<typeof ModerateReviewInput>;

export const RespondToReviewInput = z.object({
  reviewId: Uuid,
  response: z.string().min(1).max(10_000),
});
export type RespondToReviewInput = z.infer<typeof RespondToReviewInput>;

export const HelpfulVoteInput = z.object({
  reviewId: Uuid,
  customerId: Uuid.optional(),
  voterFingerprint: z.string().min(8).max(127), // hashed IP + UA when anon
  helpful: z.boolean(),
});
export type HelpfulVoteInput = z.infer<typeof HelpfulVoteInput>;

// ─── Q&A ──────────────────────────────────────────────────────────────

export const SubmitQuestionInput = z.object({
  productId: Uuid,
  customerId: Uuid.optional(),
  displayName: z.string().max(63).optional(),
  body: z.string().min(1).max(2000),
});
export type SubmitQuestionInput = z.infer<typeof SubmitQuestionInput>;

export const SubmitAnswerInput = z.object({
  questionId: Uuid,
  body: z.string().min(1).max(10_000),
  // Staff answers are flagged; customer answers default to false.
  isOfficial: z.boolean().default(false),
  authorCustomerId: Uuid.optional(),
});
export type SubmitAnswerInput = z.infer<typeof SubmitAnswerInput>;

// ─── Wishlist ─────────────────────────────────────────────────────────

export const CreateWishlistInput = z.object({
  customerId: Uuid,
  name: z.string().min(1).max(127).default('My Wishlist'),
  isPublic: z.boolean().default(false),
});
export type CreateWishlistInput = z.infer<typeof CreateWishlistInput>;

export const AddWishlistItemInput = z.object({
  wishlistId: Uuid,
  variantId: Uuid,
  note: z.string().max(2000).optional(),
});
export type AddWishlistItemInput = z.infer<typeof AddWishlistItemInput>;
