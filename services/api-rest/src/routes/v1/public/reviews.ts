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

  return Promise.resolve();
};

export default publicReviewRoutes;
