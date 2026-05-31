// Current-user — preferences, favorites, recents.
//
//   GET    /v1/me/preferences                       → user preferences blob
//   PATCH  /v1/me/preferences                       → patch preferences
//   GET    /v1/me/favorites                         → ordered favorites
//   POST   /v1/me/favorites                         → add one
//   DELETE /v1/me/favorites/:actionId               → remove one
//   PUT    /v1/me/favorites/order                   → reorder all
//   GET    /v1/me/recents                           → recents (limit ?take)
//   POST   /v1/me/recents                           → record visit
//   DELETE /v1/me/recents                           → clear recents
//
// Preferences live on the User row (Better Auth's auth table). Favorites
// and recents are tenant-scoped shell tables (FORCE RLS) — they go through
// `withRequestTenant` so SET LOCAL app.tenant_id lets RLS enforce isolation.
//
// Manifest-id validation (the equivalent of `findFavoritableById` in the
// dashboard) lives client-side — the manifests are presentation metadata
// that don't belong in api-rest. We trust the dashboard to send valid ids;
// duplicate inserts are absorbed via upsert + the unique constraint.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@sparx/api-core/db';
import { ok } from '@sparx/api-core/envelope';
import { requireAuth } from '@sparx/api-core/auth';

const DEFAULT_DETAIL_VIEWS = ['drawer', 'modal', 'fullPage', 'newTab'] as const;
const DEFAULT_LIST_VIEWS = ['table', 'card'] as const;

const PreferencesPatch = z.object({
  defaultDetailView: z.enum(DEFAULT_DETAIL_VIEWS).optional(),
  defaultListView: z.enum(DEFAULT_LIST_VIEWS).optional(),
});

const ActionIdParam = z.object({
  actionId: z.string().min(1).max(255),
});

const FavoriteCreate = z.object({
  actionId: z.string().min(1).max(255),
});

const ReorderBody = z.object({
  orderedActionIds: z.array(z.string().min(1).max(255)).max(1000),
});

const RecordVisitBody = z.object({
  actionId: z.string().min(1).max(255),
});

const RecentsQuery = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
});

const DEFAULT_PREFERENCES = {
  defaultDetailView: 'drawer' as const,
  defaultListView: 'table' as const,
};

function parsePreferences(raw: unknown): {
  defaultDetailView: (typeof DEFAULT_DETAIL_VIEWS)[number];
  defaultListView: (typeof DEFAULT_LIST_VIEWS)[number];
} {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFERENCES;
  const obj = raw as Record<string, unknown>;
  const view = obj.defaultDetailView;
  const listView = obj.defaultListView;
  return {
    defaultDetailView:
      typeof view === 'string' && (DEFAULT_DETAIL_VIEWS as readonly string[]).includes(view)
        ? (view as (typeof DEFAULT_DETAIL_VIEWS)[number])
        : DEFAULT_PREFERENCES.defaultDetailView,
    defaultListView:
      typeof listView === 'string' && (DEFAULT_LIST_VIEWS as readonly string[]).includes(listView)
        ? (listView as (typeof DEFAULT_LIST_VIEWS)[number])
        : DEFAULT_PREFERENCES.defaultListView,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync type demands async; no top-level await needed because route registration is sync.
const meRoutes: FastifyPluginAsync = async (app) => {
  // Preferences live on the `users` row. `users` is ENABLE + NO FORCE RLS with
  // a `tenant_id = current_tenant_id()` policy: Better Auth (sparx_owner) owns
  // the table and bypasses it, but api-rest runs as sparx_app and is subject to
  // the policy — so these MUST go through `withRequestTenant` to set the
  // `app.tenant_id` GUC. A bare `prisma.user.*` here sees zero rows (GET) and
  // throws P2025 on update.
  app.get('/v1/me/preferences', async (request) => {
    const auth = requireAuth(request);
    const row = await withRequestTenant(request, (tx) =>
      tx.user.findUnique({
        where: { id: auth.actorId },
        select: { preferences: true },
      })
    );
    return ok(parsePreferences(row?.preferences ?? null));
  });

  app.patch('/v1/me/preferences', async (request) => {
    const auth = requireAuth(request);
    const input = PreferencesPatch.parse(request.body);
    const next = await withRequestTenant(request, async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: auth.actorId },
        select: { preferences: true },
      });
      const current = parsePreferences(before?.preferences ?? null);
      const merged = { ...current, ...input };
      await tx.user.update({
        where: { id: auth.actorId },
        data: { preferences: merged },
      });
      return merged;
    });
    return ok(next);
  });

  app.get('/v1/me/favorites', async (request) => {
    const auth = requireAuth(request);
    const rows = await withRequestTenant(request, (tx) =>
      tx.userFavorite.findMany({
        where: { userId: auth.actorId, tenantId: auth.tenantId },
        orderBy: { position: 'asc' },
        select: { actionId: true, position: true, createdAt: true },
      })
    );
    return ok(rows);
  });

  app.post('/v1/me/favorites', async (request, reply) => {
    const auth = requireAuth(request);
    const { actionId } = FavoriteCreate.parse(request.body);
    const row = await withRequestTenant(request, async (tx) => {
      const max = await tx.userFavorite.aggregate({
        where: { userId: auth.actorId, tenantId: auth.tenantId },
        _max: { position: true },
      });
      const nextPos = (max._max.position ?? -1) + 1;
      return tx.userFavorite.upsert({
        where: {
          userId_tenantId_actionId: {
            userId: auth.actorId,
            tenantId: auth.tenantId,
            actionId,
          },
        },
        create: {
          userId: auth.actorId,
          tenantId: auth.tenantId,
          actionId,
          position: nextPos,
        },
        update: {},
        select: { actionId: true, position: true, createdAt: true },
      });
    });
    reply.code(201);
    return ok(row);
  });

  app.delete('/v1/me/favorites/:actionId', async (request, reply) => {
    const auth = requireAuth(request);
    const { actionId } = ActionIdParam.parse(request.params);
    await withRequestTenant(request, (tx) =>
      tx.userFavorite.deleteMany({
        where: { userId: auth.actorId, tenantId: auth.tenantId, actionId },
      })
    );
    reply.code(204);
  });

  app.put('/v1/me/favorites/order', async (request) => {
    const auth = requireAuth(request);
    const { orderedActionIds } = ReorderBody.parse(request.body);
    await withRequestTenant(request, async (tx) => {
      // Two-phase rewrite — mirrors the original service. The unique
      // (user_id, tenant_id, position) index check would fire mid-shuffle,
      // so push every row to a negative interim position first.
      for (let i = 0; i < orderedActionIds.length; i += 1) {
        const id = orderedActionIds[i];
        if (!id) continue;
        await tx.userFavorite.updateMany({
          where: { userId: auth.actorId, tenantId: auth.tenantId, actionId: id },
          data: { position: -(i + 1) },
        });
      }
      for (let i = 0; i < orderedActionIds.length; i += 1) {
        const id = orderedActionIds[i];
        if (!id) continue;
        await tx.userFavorite.updateMany({
          where: { userId: auth.actorId, tenantId: auth.tenantId, actionId: id },
          data: { position: i },
        });
      }
    });
    return ok({ reordered: orderedActionIds.length });
  });

  app.get('/v1/me/recents', async (request) => {
    const auth = requireAuth(request);
    const q = RecentsQuery.parse(request.query);
    const rows = await withRequestTenant(request, (tx) =>
      tx.userRecent.findMany({
        where: { userId: auth.actorId, tenantId: auth.tenantId },
        orderBy: { lastVisitedAt: 'desc' },
        take: q.take ?? 20,
        select: { actionId: true, lastVisitedAt: true },
      })
    );
    return ok(rows);
  });

  app.post('/v1/me/recents', async (request) => {
    const auth = requireAuth(request);
    const { actionId } = RecordVisitBody.parse(request.body);
    await withRequestTenant(request, (tx) =>
      tx.userRecent.upsert({
        where: {
          userId_tenantId_actionId: {
            userId: auth.actorId,
            tenantId: auth.tenantId,
            actionId,
          },
        },
        create: { userId: auth.actorId, tenantId: auth.tenantId, actionId },
        update: { lastVisitedAt: new Date() },
      })
    );
    return ok({ recorded: true });
  });

  app.delete('/v1/me/recents', async (request, reply) => {
    const auth = requireAuth(request);
    await withRequestTenant(request, (tx) =>
      tx.userRecent.deleteMany({
        where: { userId: auth.actorId, tenantId: auth.tenantId },
      })
    );
    reply.code(204);
  });
};

export default meRoutes;
