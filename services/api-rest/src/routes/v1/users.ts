// Tenant staff users.
//
//   GET /v1/users                → list users in current tenant (assignee picker)
//
// Auth-table reads (Better Auth's `user`) — the User model is RLS-ENABLE but
// NOT FORCE per packages/db/prisma/schema/03-auth.prisma, so the bare prisma
// client works. We still pin the WHERE clause to `auth.tenantId` for the same
// triple-belt reason the tenant route uses.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@sparx/db';
import { ok } from '@sparx/api-core/envelope';
import { requireAuth } from '@sparx/api-core/auth';

const ListQuery = z.object({
  take: z.coerce.number().int().min(1).max(500).optional(),
});

const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/users', async (request) => {
    const auth = requireAuth(request);
    const q = ListQuery.parse(request.query);
    const rows = await prisma.user.findMany({
      where: { tenantId: auth.tenantId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
      take: q.take ?? 100,
    });
    return ok(rows);
  });
};

export default userRoutes;
