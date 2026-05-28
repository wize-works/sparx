// Redirects.
//
//   GET    /v1/redirects                 → list
//   POST   /v1/redirects                 → create one
//   POST   /v1/redirects/bulk            → CSV-style bulk import { rows: [...] }
//   DELETE /v1/redirects/:id
//
// Chain / loop detection is enforced on insert by walking forward from
// `toPath` up to 8 hops; if we encounter `fromPath` mid-chain, reject. The
// production runtime path (Caddy + storefront edge) flattens redirects on
// resolve so the DB only needs the basic safety net here.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '../../../lib/db.js';
import { ok } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { conflict, notFound } from '../../../errors.js';
import { writeAudit } from '../../../lib/audit.js';
import { publish } from '../../../lib/pubsub.js';
import type { TxClient } from '@sparx/db';

const PathSchema = z.string().min(1).max(2048).startsWith('/', 'Paths must begin with "/".');

const CreateBody = z.object({
  from_path: PathSchema,
  to_path: PathSchema,
  status_code: z
    .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .default(301),
});

const BulkBody = z.object({
  rows: z.array(CreateBody).min(1).max(5000),
});

const PathId = z.object({ id: z.string().uuid() });

async function assertNoChain(tx: TxClient, fromPath: string, toPath: string): Promise<void> {
  if (fromPath === toPath) {
    throw conflict('A redirect cannot point to itself.');
  }
  let probe = toPath;
  for (let hop = 0; hop < 8; hop++) {
    const next = await tx.redirect.findFirst({ where: { fromPath: probe } });
    if (!next) return;
    if (next.toPath === fromPath) {
      throw conflict(`Redirect would create a loop via ${probe} → ${next.toPath}.`);
    }
    probe = next.toPath;
  }
  throw conflict('Redirect would create a chain longer than 8 hops.');
}

const redirectRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/redirects', async (request) => {
    requireRole(request, 'viewer');
    const rows = await withRequestTenant(request, (tx) =>
      tx.redirect.findMany({ orderBy: { fromPath: 'asc' }, take: 1000 })
    );
    return ok(rows);
  });

  app.post('/v1/redirects', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const input = CreateBody.parse(request.body);

    const created = await withRequestTenant(request, async (tx) => {
      await assertNoChain(tx, input.from_path, input.to_path);
      const existing = await tx.redirect.findFirst({ where: { fromPath: input.from_path } });
      if (existing) {
        throw conflict(`A redirect from "${input.from_path}" already exists.`);
      }
      const row = await tx.redirect.create({
        data: {
          tenantId: auth.tenantId,
          fromPath: input.from_path,
          toPath: input.to_path,
          statusCode: input.status_code,
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'redirect.created',
        entityType: 'redirect',
        entityId: row.id,
        after: { fromPath: row.fromPath, toPath: row.toPath, statusCode: row.statusCode },
      });
      return row;
    });

    await publish(request.log, 'redirect.added', auth.tenantId, auth.actorId, {
      id: created.id,
      fromPath: created.fromPath,
      toPath: created.toPath,
    });

    reply.code(201);
    return ok(created);
  });

  app.post('/v1/redirects/bulk', async (request) => {
    const auth = requireRole(request, 'editor');
    const input = BulkBody.parse(request.body);

    const result = await withRequestTenant(request, async (tx) => {
      const inserted: string[] = [];
      const skipped: { row: number; reason: string }[] = [];
      for (let i = 0; i < input.rows.length; i++) {
        const r = input.rows[i];
        if (!r) continue;
        try {
          await assertNoChain(tx, r.from_path, r.to_path);
          const row = await tx.redirect.create({
            data: {
              tenantId: auth.tenantId,
              fromPath: r.from_path,
              toPath: r.to_path,
              statusCode: r.status_code,
            },
          });
          inserted.push(row.id);
        } catch (err) {
          skipped.push({
            row: i,
            reason: err instanceof Error ? err.message : 'unknown',
          });
        }
      }
      await writeAudit(tx, request, auth, {
        action: 'redirect.bulk_imported',
        entityType: 'redirect',
        entityId: null,
        after: { inserted: inserted.length, skipped: skipped.length },
      });
      return { inserted: inserted.length, skipped };
    });

    return ok(result);
  });

  app.delete('/v1/redirects/:id', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);
    await withRequestTenant(request, async (tx) => {
      const existing = await tx.redirect.findFirst({ where: { id } });
      if (!existing) throw notFound('Redirect', id);
      await tx.redirect.delete({ where: { id } });
      await writeAudit(tx, request, auth, {
        action: 'redirect.deleted',
        entityType: 'redirect',
        entityId: id,
        before: { fromPath: existing.fromPath, toPath: existing.toPath },
      });
    });
    await publish(request.log, 'redirect.removed', auth.tenantId, auth.actorId, { id });
    reply.code(204);
  });
  return Promise.resolve();
};

export default redirectRoutes;
