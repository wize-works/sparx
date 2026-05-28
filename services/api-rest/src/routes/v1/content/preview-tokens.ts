// Preview tokens.
//
//   POST /v1/content/entries/:id/preview-tokens
//
// Issues a short-lived (15 min) HS256 JWT scoped to one entry. The storefront
// (or apps/web) honors `?sparxPreview=<token>` by calling the consumer-facing
// preview endpoint (lands in Phase 4) with the token in
// `Authorization: Preview <token>`. The token's `jti` is persisted so it can
// be revoked individually without rotating the tenant secret.
//
// Re-uses the same shared SPARX_INTERNAL_JWT_SECRET as the dashboard auth
// JWT (different `aud` claim distinguishes the two so a preview token can't
// be replayed as a session token and vice versa).

import { randomUUID } from 'node:crypto';
import jwt from '@fastify/jwt';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../../../env.js';
import { withRequestTenant } from '../../../lib/db.js';
import { ok } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { notFound } from '../../../errors.js';

void jwt; // keep the import — type augmentations live in plugins/auth.ts

const PathId = z.object({ id: z.string().uuid() });

const TTL_SECONDS = 15 * 60;

const previewTokenRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/content/entries/:id/preview-tokens', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);

    const issued = await withRequestTenant(request, async (tx) => {
      const entry = await tx.contentEntry.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, typeKey: true, slug: true },
      });
      if (!entry) throw notFound('Entry', id);

      const jti = randomUUID();
      const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

      await tx.previewToken.create({
        data: {
          tenantId: auth.tenantId,
          entryId: entry.id,
          issuedById: auth.actorId,
          jti,
          expiresAt,
        },
      });

      return { entry, jti, expiresAt };
    });

    // Sign the JWT outside the tx — the token isn't itself part of the row.
    // `aud: preview` distinguishes preview tokens from session tokens; the
    // verifier (Phase 4 consumer-facing route) checks both.
    const token = await app.jwt.sign(
      {
        sub: issued.entry.id,
        tid: auth.tenantId,
        aud: 'preview',
        jti: issued.jti,
      },
      { expiresIn: TTL_SECONDS }
    );

    return ok({
      token,
      entry_id: issued.entry.id,
      jti: issued.jti,
      expires_at: issued.expiresAt.toISOString(),
      type_key: issued.entry.typeKey,
      slug: issued.entry.slug,
    });
  });

  // Revoke a previously-issued token. The verifier (Phase 4) consults the
  // table for the jti's revokedAt before accepting it.
  app.delete('/v1/content/entries/:id/preview-tokens/:jti', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const params = z
      .object({ id: z.string().uuid(), jti: z.string().uuid() })
      .parse(request.params);

    await withRequestTenant(request, async (tx) => {
      const row = await tx.previewToken.findFirst({
        where: { entryId: params.id, jti: params.jti },
      });
      if (!row) throw notFound('Preview token', params.jti);
      await tx.previewToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
    });

    void auth;
    reply.code(204);
  });
};

export default previewTokenRoutes;
