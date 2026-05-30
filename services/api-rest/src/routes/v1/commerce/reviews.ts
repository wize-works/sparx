// Commerce — reviews, Q&A, wishlists.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { reviewService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const ProductIdParam = z.object({ productId: z.string().uuid() });

const reviewRoutes: FastifyPluginAsync = async (app) => {
  // Reviews
  app.get('/v1/commerce/reviews/pending', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await reviewService.listPendingModeration(toCommerceContext(request)));
  });

  app.get('/v1/commerce/reviews/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await reviewService.getReview(toCommerceContext(request), id));
  });

  app.get('/v1/commerce/products/:productId/reviews', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { productId } = ProductIdParam.parse(request.params);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await reviewService.listReviewsForProduct(toCommerceContext(request), productId, {
        status: q?.status as never,
        take: q?.take ? Number(q.take) : undefined,
      })
    );
  });

  app.post('/v1/commerce/reviews/:id/moderate', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body as Record<string, unknown>) ?? {};
    await reviewService.moderate(toCommerceContext(request), { ...body, reviewId: id });
    return ok({ id, moderated: true });
  });

  app.post('/v1/commerce/reviews/:id/respond', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body as Record<string, unknown>) ?? {};
    await reviewService.respond(toCommerceContext(request), { ...body, reviewId: id });
    return ok({ id, responded: true });
  });

  app.delete('/v1/commerce/reviews/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await reviewService.deleteReview(toCommerceContext(request), id);
    reply.code(204);
  });

  // Q&A
  app.get('/v1/commerce/questions/pending', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await reviewService.listPendingQuestions(toCommerceContext(request)));
  });

  app.post('/v1/commerce/questions/:id/moderate', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    const body = z
      .object({ status: z.enum(['published', 'rejected']) })
      .parse(request.body ?? {});
    await reviewService.moderateQuestion(toCommerceContext(request), {
      questionId: id,
      status: body.status,
    });
    return ok({ id, moderated: true });
  });

  app.post('/v1/commerce/questions/:id/answer', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    const body = (request.body as Record<string, unknown>) ?? {};
    return ok(
      await reviewService.submitAnswer(toCommerceContext(request), { ...body, questionId: id })
    );
  });

  // Wishlists analytics
  app.get('/v1/commerce/wishlists/top-variants', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await reviewService.topWishlistedVariants(
        toCommerceContext(request),
        q?.take ? Number(q.take) : 50
      )
    );
  });
};

export default reviewRoutes;
