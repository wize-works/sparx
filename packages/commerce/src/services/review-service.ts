// reviewService — product reviews, Q&A, wishlists.
//
// Moderation gate lives here; `review.submitted` fires on submit and
// `review.published` fires when status flips to `approved` so the
// storefront cache invalidates and aggregate ratings recompute.
//
// Q&A follows the same pending → published moderation gate.
//
// Wishlists are not moderated — customers own them; staff use the
// listing here as analytics (which variants are most-saved).

import {
  AddWishlistItemInput,
  CreateWishlistInput,
  HelpfulVoteInput,
  ModerateReviewInput,
  RespondToReviewInput,
  type ReviewModerationStatus,
  SubmitAnswerInput,
  SubmitQuestionInput,
  SubmitReviewInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Reviews ──────────────────────────────────────────────────────────

export interface ReviewRow {
  id: string;
  productId: string;
  variantId: string | null;
  customerId: string | null;
  orderId: string | null;
  rating: number;
  title: string;
  body: string;
  displayName: string | null;
  status: ReviewModerationStatus;
  verifiedPurchase: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  response: string | null;
  respondedAt: string | null;
  mediaAssetIds: string[];
  createdAt: string;
}

export async function listReviewsForProduct(
  ctx: ServiceContext,
  productId: string,
  filter: { status?: ReviewModerationStatus; take?: number; skip?: number } = {}
): Promise<{ items: ReviewRow[]; total: number; averageRating: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.ProductReviewWhereInput = {
      productId,
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [rows, total, agg] = await Promise.all([
      tx.productReview.findMany({
        where,
        include: { media: { orderBy: { position: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: filter.take ?? 50,
        skip: filter.skip ?? 0,
      }),
      tx.productReview.count({ where }),
      tx.productReview.aggregate({
        where: { productId, status: 'approved', deletedAt: null },
        _avg: { rating: true },
      }),
    ]);
    return {
      items: rows.map(toReviewRow),
      total,
      averageRating: agg._avg.rating ?? 0,
    };
  });
}

export async function listPendingModeration(ctx: ServiceContext): Promise<ReviewRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productReview.findMany({
      where: { status: { in: ['pending', 'flagged'] }, deletedAt: null },
      include: { media: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map(toReviewRow);
  });
}

export async function getReview(ctx: ServiceContext, reviewId: string): Promise<ReviewRow> {
  const row = await withTenant(ctx, async (tx) => {
    return tx.productReview.findFirst({
      where: { id: reviewId, deletedAt: null },
      include: { media: { orderBy: { position: 'asc' } } },
    });
  });
  if (!row) throw new CommerceNotFoundError('ProductReview', reviewId);
  return toReviewRow(row);
}

export async function submit(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; status: ReviewModerationStatus }> {
  const input = SubmitReviewInput.parse(rawInput);

  const product = await withTenant(ctx, (tx) =>
    tx.product.findFirst({ where: { id: input.productId }, select: { id: true } })
  );
  if (!product) throw new CommerceNotFoundError('Product', input.productId);

  const verifiedPurchase = input.orderId ? true : false;
  // Verified-purchase reviews bypass the moderation queue.
  const initialStatus: ReviewModerationStatus = verifiedPurchase ? 'approved' : 'pending';

  const review = await withTenant(ctx, async (tx) => {
    const created = await tx.productReview.create({
      data: {
        tenantId: ctx.tenantId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        customerId: input.customerId ?? null,
        orderId: input.orderId ?? null,
        rating: input.rating,
        title: input.title,
        body: input.body,
        displayName: input.displayName ?? null,
        status: initialStatus,
        ...(verifiedPurchase
          ? { moderatedAt: new Date(), moderationNote: 'auto-approved (verified purchase)' }
          : {}),
      },
    });

    if (input.mediaAssetIds.length > 0) {
      await tx.reviewMedia.createMany({
        data: input.mediaAssetIds.map((mediaAssetId, position) => ({
          tenantId: ctx.tenantId,
          reviewId: created.id,
          mediaAssetId,
          position,
        })),
      });
    }

    await tx.reviewModerationLog.create({
      data: {
        tenantId: ctx.tenantId,
        reviewId: created.id,
        action: 'submitted',
        actorUserId: ctx.userId ?? null,
        note: verifiedPurchase ? 'auto-approved' : null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: input.customerId ?? ctx.userId ?? null,
      actorType: input.customerId ? 'customer' : ctx.userId ? 'user' : 'system',
      action: 'commerce.review.submitted',
      entityType: 'ProductReview',
      entityId: created.id,
      diff: { after: { rating: input.rating, status: initialStatus } },
    });

    return created;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: input.customerId ?? null,
    topic: 'review.submitted',
    data: {
      reviewId: review.id,
      productId: review.productId,
      rating: review.rating,
      verifiedPurchase,
    },
  });

  if (initialStatus === 'approved') {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: input.customerId ?? null,
      topic: 'review.published',
      data: { reviewId: review.id, productId: review.productId, rating: review.rating },
    });
  }

  return { id: review.id, status: initialStatus };
}

export async function moderate(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = ModerateReviewInput.parse(rawInput);

  const change = await withTenant(ctx, async (tx) => {
    const existing = await tx.productReview.findFirst({
      where: { id: input.reviewId, deletedAt: null },
    });
    if (!existing) throw new CommerceNotFoundError('ProductReview', input.reviewId);
    const previousStatus = existing.status;

    await tx.productReview.update({
      where: { id: input.reviewId },
      data: {
        status: input.status,
        moderationNote: input.moderationNote ?? null,
        moderatedBy: ctx.userId ?? null,
        moderatedAt: new Date(),
      },
    });

    await tx.reviewModerationLog.create({
      data: {
        tenantId: ctx.tenantId,
        reviewId: input.reviewId,
        action: input.status,
        actorUserId: ctx.userId ?? null,
        note: input.moderationNote ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: `commerce.review.${input.status}`,
      entityType: 'ProductReview',
      entityId: input.reviewId,
      diff: { before: { status: previousStatus }, after: { status: input.status } },
    });

    return { previousStatus, productId: existing.productId, rating: existing.rating };
  });

  if (input.status === 'approved' && change.previousStatus !== 'approved') {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'review.published',
      data: { reviewId: input.reviewId, productId: change.productId, rating: change.rating },
    });
  } else if (input.status === 'flagged') {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'review.flagged',
      data: { reviewId: input.reviewId, productId: change.productId },
    });
  }
}

export async function respond(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = RespondToReviewInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const existing = await tx.productReview.findFirst({
      where: { id: input.reviewId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new CommerceNotFoundError('ProductReview', input.reviewId);

    await tx.productReview.update({
      where: { id: input.reviewId },
      data: {
        response: input.response,
        responseAuthorId: ctx.userId ?? null,
        respondedAt: new Date(),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.review.responded',
      entityType: 'ProductReview',
      entityId: input.reviewId,
      diff: { after: { response: input.response } },
    });
  });
}

export async function recordHelpfulVote(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ helpfulCount: number; unhelpfulCount: number }> {
  const input = HelpfulVoteInput.parse(rawInput);

  return withTenant(ctx, async (tx) => {
    const review = await tx.productReview.findFirst({
      where: { id: input.reviewId, deletedAt: null },
      select: { id: true, helpfulCount: true, unhelpfulCount: true },
    });
    if (!review) throw new CommerceNotFoundError('ProductReview', input.reviewId);

    // Idempotent on (reviewId, voterFingerprint) — voter can change their
    // mind; previous vote is subtracted before the new one is added.
    const existing = await tx.reviewHelpfulVote.findUnique({
      where: {
        reviewId_voterFingerprint: {
          reviewId: input.reviewId,
          voterFingerprint: input.voterFingerprint,
        },
      },
    });

    let helpfulDelta = 0;
    let unhelpfulDelta = 0;

    if (existing) {
      if (existing.helpful === input.helpful) {
        return { helpfulCount: review.helpfulCount, unhelpfulCount: review.unhelpfulCount };
      }
      helpfulDelta = input.helpful ? 1 : -1;
      unhelpfulDelta = input.helpful ? -1 : 1;
      await tx.reviewHelpfulVote.update({
        where: { id: existing.id },
        data: { helpful: input.helpful, customerId: input.customerId ?? null },
      });
    } else {
      helpfulDelta = input.helpful ? 1 : 0;
      unhelpfulDelta = input.helpful ? 0 : 1;
      await tx.reviewHelpfulVote.create({
        data: {
          tenantId: ctx.tenantId,
          reviewId: input.reviewId,
          customerId: input.customerId ?? null,
          voterFingerprint: input.voterFingerprint,
          helpful: input.helpful,
        },
      });
    }

    const updated = await tx.productReview.update({
      where: { id: input.reviewId },
      data: {
        helpfulCount: { increment: helpfulDelta },
        unhelpfulCount: { increment: unhelpfulDelta },
      },
      select: { helpfulCount: true, unhelpfulCount: true },
    });

    return { helpfulCount: updated.helpfulCount, unhelpfulCount: updated.unhelpfulCount };
  });
}

export async function deleteReview(ctx: ServiceContext, reviewId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.productReview.findFirst({
      where: { id: reviewId, deletedAt: null },
      select: { id: true, productId: true },
    });
    if (!existing) throw new CommerceNotFoundError('ProductReview', reviewId);

    await tx.productReview.update({
      where: { id: reviewId },
      data: { deletedAt: new Date(), status: 'rejected' },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.review.deleted',
      entityType: 'ProductReview',
      entityId: reviewId,
    });
  });
}

// ─── Q&A ──────────────────────────────────────────────────────────────

export interface QuestionRow {
  id: string;
  productId: string;
  customerId: string | null;
  displayName: string | null;
  body: string;
  status: string;
  helpfulCount: number;
  createdAt: string;
  answers: AnswerRow[];
}

export interface AnswerRow {
  id: string;
  questionId: string;
  body: string;
  isOfficial: boolean;
  authorCustomerId: string | null;
  authorUserId: string | null;
  helpfulCount: number;
  createdAt: string;
}

export async function listQuestionsForProduct(
  ctx: ServiceContext,
  productId: string,
  filter: { status?: string; take?: number } = {}
): Promise<QuestionRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productQuestion.findMany({
      where: {
        productId,
        ...(filter.status ? { status: filter.status } : {}),
      },
      include: { answers: { orderBy: [{ isOfficial: 'desc' }, { createdAt: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
      take: filter.take ?? 100,
    });
    return rows.map(toQuestionRow);
  });
}

export async function listPendingQuestions(ctx: ServiceContext): Promise<QuestionRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productQuestion.findMany({
      where: { status: 'pending' },
      include: { answers: true },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map(toQuestionRow);
  });
}

export async function submitQuestion(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = SubmitQuestionInput.parse(rawInput);

  const product = await withTenant(ctx, (tx) =>
    tx.product.findFirst({ where: { id: input.productId }, select: { id: true } })
  );
  if (!product) throw new CommerceNotFoundError('Product', input.productId);

  const question = await withTenant(ctx, async (tx) => {
    const created = await tx.productQuestion.create({
      data: {
        tenantId: ctx.tenantId,
        productId: input.productId,
        customerId: input.customerId ?? null,
        displayName: input.displayName ?? null,
        body: input.body,
        status: 'pending',
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: input.customerId ?? null,
      actorType: input.customerId ? 'customer' : 'system',
      action: 'commerce.question.submitted',
      entityType: 'ProductQuestion',
      entityId: created.id,
    });

    return created;
  });

  return { id: question.id };
}

export async function moderateQuestion(
  ctx: ServiceContext,
  input: { questionId: string; status: 'published' | 'rejected' }
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.productQuestion.findFirst({
      where: { id: input.questionId },
      select: { id: true, status: true },
    });
    if (!existing) throw new CommerceNotFoundError('ProductQuestion', input.questionId);

    await tx.productQuestion.update({
      where: { id: input.questionId },
      data: { status: input.status },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: `commerce.question.${input.status}`,
      entityType: 'ProductQuestion',
      entityId: input.questionId,
      diff: { before: { status: existing.status }, after: { status: input.status } },
    });
  });
}

export async function submitAnswer(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = SubmitAnswerInput.parse(rawInput);

  const question = await withTenant(ctx, (tx) =>
    tx.productQuestion.findFirst({ where: { id: input.questionId }, select: { id: true } })
  );
  if (!question) throw new CommerceNotFoundError('ProductQuestion', input.questionId);

  // Staff answers (isOfficial=true) require a user context; customer
  // answers require an authorCustomerId. Reject anything ambiguous.
  if (input.isOfficial && !ctx.userId) {
    throw new CommerceValidationError('Staff answers require an authenticated user context');
  }

  const answer = await withTenant(ctx, async (tx) => {
    const created = await tx.productAnswer.create({
      data: {
        tenantId: ctx.tenantId,
        questionId: input.questionId,
        body: input.body,
        isOfficial: input.isOfficial,
        authorCustomerId: input.isOfficial ? null : (input.authorCustomerId ?? null),
        authorUserId: input.isOfficial ? (ctx.userId ?? null) : null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? input.authorCustomerId ?? null,
      actorType: input.isOfficial ? 'user' : 'customer',
      action: 'commerce.answer.submitted',
      entityType: 'ProductAnswer',
      entityId: created.id,
    });

    return created;
  });

  return { id: answer.id };
}

// ─── Wishlists ────────────────────────────────────────────────────────

export interface WishlistRow {
  id: string;
  customerId: string;
  name: string;
  isPublic: boolean;
  shareToken: string | null;
  itemCount: number;
  createdAt: string;
}

export interface WishlistItemRow {
  id: string;
  wishlistId: string;
  variantId: string;
  note: string | null;
  createdAt: string;
}

export async function createWishlist(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateWishlistInput.parse(rawInput);

  const wishlist = await withTenant(ctx, async (tx) => {
    const created = await tx.wishlist.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        name: input.name,
        isPublic: input.isPublic,
        shareToken: input.isPublic ? randomShareToken() : null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? input.customerId,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.wishlist.created',
      entityType: 'Wishlist',
      entityId: created.id,
    });

    return created;
  });

  return { id: wishlist.id };
}

export async function addWishlistItem(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = AddWishlistItemInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const wishlist = await tx.wishlist.findFirst({
      where: { id: input.wishlistId },
      select: { id: true, customerId: true },
    });
    if (!wishlist) throw new CommerceNotFoundError('Wishlist', input.wishlistId);

    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId },
      select: { id: true },
    });
    if (!variant) throw new CommerceNotFoundError('ProductVariant', input.variantId);

    // Idempotent: re-adding the same variant updates the note.
    await tx.wishlistItem.upsert({
      where: {
        wishlistId_variantId: {
          wishlistId: input.wishlistId,
          variantId: input.variantId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        wishlistId: input.wishlistId,
        variantId: input.variantId,
        note: input.note ?? null,
      },
      update: {
        note: input.note ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? wishlist.customerId,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.wishlist.item_added',
      entityType: 'Wishlist',
      entityId: input.wishlistId,
      diff: { after: { variantId: input.variantId } },
    });
  });
}

export async function removeWishlistItem(
  ctx: ServiceContext,
  wishlistId: string,
  variantId: string
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.wishlistItem
      .delete({ where: { wishlistId_variantId: { wishlistId, variantId } } })
      .catch(() => null);
  });
}

export async function listWishlistsForCustomer(
  ctx: ServiceContext,
  customerId: string
): Promise<(WishlistRow & { items: WishlistItemRow[] })[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.wishlist.findMany({
      where: { customerId },
      include: {
        items: { orderBy: { createdAt: 'desc' } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      name: r.name,
      isPublic: r.isPublic,
      shareToken: r.shareToken,
      itemCount: r._count.items,
      createdAt: r.createdAt.toISOString(),
      items: r.items.map((it) => ({
        id: it.id,
        wishlistId: it.wishlistId,
        variantId: it.variantId,
        note: it.note,
        createdAt: it.createdAt.toISOString(),
      })),
    }));
  });
}

export interface WishlistAnalyticsRow {
  variantId: string;
  productId: string | null;
  saveCount: number;
}

// Cross-customer aggregate: which variants are most-wishlisted? Staff
// uses this to prioritize restock / promo / email campaigns.
export async function topWishlistedVariants(
  ctx: ServiceContext,
  take = 50
): Promise<WishlistAnalyticsRow[]> {
  return withTenant(ctx, async (tx) => {
    const groups = await tx.wishlistItem.groupBy({
      by: ['variantId'],
      _count: { variantId: true },
      orderBy: { _count: { variantId: 'desc' } },
      take,
    });

    if (groups.length === 0) return [];

    const variantIds = groups.map((g) => g.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true },
    });
    const productByVariant = new Map(variants.map((v) => [v.id, v.productId]));

    return groups.map((g) => ({
      variantId: g.variantId,
      productId: productByVariant.get(g.variantId) ?? null,
      saveCount: g._count.variantId,
    }));
  });
}

// ─── helpers ──────────────────────────────────────────────────────────

function toReviewRow(row: Prisma.ProductReviewGetPayload<{ include: { media: true } }>): ReviewRow {
  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    customerId: row.customerId,
    orderId: row.orderId,
    rating: row.rating,
    title: row.title,
    body: row.body,
    displayName: row.displayName,
    status: row.status as ReviewModerationStatus,
    verifiedPurchase: row.orderId !== null,
    helpfulCount: row.helpfulCount,
    unhelpfulCount: row.unhelpfulCount,
    response: row.response,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    mediaAssetIds: row.media.map((m) => m.mediaAssetId),
    createdAt: row.createdAt.toISOString(),
  };
}

function toQuestionRow(
  row: Prisma.ProductQuestionGetPayload<{ include: { answers: true } }>
): QuestionRow {
  return {
    id: row.id,
    productId: row.productId,
    customerId: row.customerId,
    displayName: row.displayName,
    body: row.body,
    status: row.status,
    helpfulCount: row.helpfulCount,
    createdAt: row.createdAt.toISOString(),
    answers: row.answers.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      body: a.body,
      isOfficial: a.isOfficial,
      authorCustomerId: a.authorCustomerId,
      authorUserId: a.authorUserId,
      helpfulCount: a.helpfulCount,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

function randomShareToken(): string {
  // Public wishlist share tokens. 16 chars from a URL-safe alphabet =
  // ~95 bits of entropy, plenty for a non-secret share link.
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz23456789';
  let out = '';
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 16; i++) {
    const byte = bytes[i] ?? 0;
    out += alphabet[byte % alphabet.length];
  }
  return out;
}
