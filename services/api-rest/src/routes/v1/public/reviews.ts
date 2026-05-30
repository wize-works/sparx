// Public product-review submission for the storefront.
//
//   POST /v1/public/commerce/products/:handle/reviews  ?tenant=
//     { rating, authorName, authorEmail, title?, body }
//
// Resolves the product by handle, then hands off to reviewService.submit
// (which Zod-validates + de-dupes). Reviews land in moderation per the
// service's own rules; the storefront shows a "thanks, pending" state. Guest
// submissions are accepted; a signed-in customer's name/email prefill the form
// client-side.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { reviewService } from '@sparx/commerce';
import { verifyCustomerSession, SESSION_COOKIE_NAME } from '@sparx/customer-auth';
import { withTenant } from '@sparx/db';
import { ok } from '@sparx/api-core/envelope';
import { badRequest, notFound } from '@sparx/api-core/errors';

import { publicCommerceContext } from '../../../lib/public-commerce-context.js';

const HandleParam = z.object({ handle: z.string().min(1).max(255) });

const ReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  authorName: z.string().min(1).max(120),
  authorEmail: z.string().email(),
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
});

const QuestionBody = z.object({
  displayName: z.string().min(1).max(63).optional(),
  body: z.string().min(1).max(2000),
});

const publicReviewRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/public/commerce/products/:handle/reviews', async (request) => {
    const { handle } = HandleParam.parse(request.params);
    const body = ReviewBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);

    const product = await withTenant({ tenantId }, (tx) =>
      tx.product.findFirst({
        where: { handle, status: 'active', deletedAt: null },
        select: { id: true },
      })
    );
    if (!product) throw notFound('Product', handle);

    try {
      const result = await reviewService.submit(ctx, {
        productId: product.id,
        rating: body.rating,
        authorName: body.authorName,
        authorEmail: body.authorEmail,
        ...(body.title ? { title: body.title } : {}),
        body: body.body,
      });
      return ok({ reviewId: result.id, status: result.status });
    } catch (err) {
      throw badRequest((err as Error).message || 'Could not submit review.');
    }
  });

  // ─── Q&A ───────────────────────────────────────────────────────────
  //
  //   GET  /v1/public/commerce/products/:handle/questions  ?tenant=
  //     → published questions + their answers (official answers first)
  //   POST /v1/public/commerce/products/:handle/questions  ?tenant=
  //     { displayName?, body }  → enters moderation (status=pending)
  //
  // A signed-in shopper's question is attributed to their customer id; guests
  // submit with an optional display name. Answers are merchant-authored, so the
  // storefront only reads them.

  app.get('/v1/public/commerce/products/:handle/questions', async (request) => {
    const { handle } = HandleParam.parse(request.params);
    const { tenantId, ctx } = await publicCommerceContext(request);

    const product = await withTenant({ tenantId }, (tx) =>
      tx.product.findFirst({
        where: { handle, status: 'active', deletedAt: null },
        select: { id: true },
      })
    );
    if (!product) throw notFound('Product', handle);

    const questions = await reviewService.listQuestionsForProduct(ctx, product.id, {
      status: 'published',
    });
    // Strip moderation-only fields; expose just what the PDP renders.
    return ok(
      questions.map((q) => ({
        id: q.id,
        displayName: q.displayName,
        body: q.body,
        createdAt: q.createdAt,
        helpfulCount: q.helpfulCount,
        answers: q.answers.map((a) => ({
          id: a.id,
          body: a.body,
          isOfficial: a.isOfficial,
          createdAt: a.createdAt,
        })),
      }))
    );
  });

  app.post('/v1/public/commerce/products/:handle/questions', async (request) => {
    const { handle } = HandleParam.parse(request.params);
    const body = QuestionBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);

    const product = await withTenant({ tenantId }, (tx) =>
      tx.product.findFirst({
        where: { handle, status: 'active', deletedAt: null },
        select: { id: true },
      })
    );
    if (!product) throw notFound('Product', handle);

    // Attribute to the signed-in customer when a valid session cookie is
    // present; otherwise it's a guest question (optional display name).
    let customerId: string | undefined;
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      const session = await verifyCustomerSession({ tenantId }, token);
      if (session) customerId = session.customerId;
    }

    try {
      const result = await reviewService.submitQuestion(ctx, {
        productId: product.id,
        body: body.body,
        ...(customerId ? { customerId } : {}),
        ...(body.displayName ? { displayName: body.displayName } : {}),
      });
      return ok({ questionId: result.id, status: 'pending' });
    } catch (err) {
      throw badRequest((err as Error).message || 'Could not submit question.');
    }
  });

  return Promise.resolve();
};

export default publicReviewRoutes;
