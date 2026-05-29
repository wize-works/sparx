// reviewService — product reviews, Q&A, wishlists. Moderation gate lives
// here; published reviews fire review.published for storefront cache
// invalidation.

import type {
  AddWishlistItemInput,
  CreateWishlistInput,
  HelpfulVoteInput,
  ModerateReviewInput,
  RespondToReviewInput,
  ReviewModerationStatus,
  SubmitAnswerInput,
  SubmitQuestionInput,
  SubmitReviewInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Reviews ──────────────────────────────────────────────────────────

export interface ReviewRow {
  id: string;
  productId: string;
  rating: number;
  title: string;
  status: ReviewModerationStatus;
  verifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string;
}

export function listReviewsForProduct(
  _ctx: ServiceContext,
  _productId: string,
  _filter: { status?: ReviewModerationStatus; take?: number; skip?: number } = {}
): Promise<{ items: ReviewRow[]; total: number; averageRating: number }> {
  return notImplemented('reviewService.listReviewsForProduct');
}

export function listPendingModeration(_ctx: ServiceContext): Promise<ReviewRow[]> {
  return notImplemented('reviewService.listPendingModeration');
}

export function submit(
  _ctx: ServiceContext,
  _input: SubmitReviewInput
): Promise<{ id: string; status: ReviewModerationStatus }> {
  return notImplemented('reviewService.submit');
}

export function moderate(_ctx: ServiceContext, _input: ModerateReviewInput): Promise<void> {
  return notImplemented('reviewService.moderate');
}

export function respond(_ctx: ServiceContext, _input: RespondToReviewInput): Promise<void> {
  return notImplemented('reviewService.respond');
}

export function recordHelpfulVote(
  _ctx: ServiceContext,
  _input: HelpfulVoteInput
): Promise<{ helpfulCount: number }> {
  return notImplemented('reviewService.recordHelpfulVote');
}

// ─── Q&A ──────────────────────────────────────────────────────────────

export function submitQuestion(
  _ctx: ServiceContext,
  _input: SubmitQuestionInput
): Promise<{ id: string }> {
  return notImplemented('reviewService.submitQuestion');
}

export function submitAnswer(
  _ctx: ServiceContext,
  _input: SubmitAnswerInput
): Promise<{ id: string }> {
  return notImplemented('reviewService.submitAnswer');
}

// ─── Wishlists ────────────────────────────────────────────────────────

export function createWishlist(
  _ctx: ServiceContext,
  _input: CreateWishlistInput
): Promise<{ id: string }> {
  return notImplemented('reviewService.createWishlist');
}

export function addWishlistItem(_ctx: ServiceContext, _input: AddWishlistItemInput): Promise<void> {
  return notImplemented('reviewService.addWishlistItem');
}

export function listWishlistsForCustomer(
  _ctx: ServiceContext,
  _customerId: string
): Promise<unknown[]> {
  return notImplemented('reviewService.listWishlistsForCustomer');
}
