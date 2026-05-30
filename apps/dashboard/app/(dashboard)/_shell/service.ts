import 'server-only';
import { withTenant } from '@sparx/db';
import { findFavoritableById } from './registry';

// Dashboard shell — favorites + recents service layer.
//
// Phase 1 lives co-located with the dashboard; future REST/MCP transports
// would wrap these same functions from a shared package. Every call goes
// through `withTenant` so RLS enforces tenant isolation in addition to the
// explicit WHERE clauses below.

export interface ShellContext {
  userId: string;
  tenantId: string;
}

const RECENTS_LIMIT = 20;

// ── Favorites ─────────────────────────────────────────────

export interface FavoriteRow {
  actionId: string;
  position: number;
  createdAt: Date;
}

export async function listFavorites(ctx: ShellContext): Promise<FavoriteRow[]> {
  return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
    const rows = await tx.userFavorite.findMany({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
      orderBy: { position: 'asc' },
      select: { actionId: true, position: true, createdAt: true },
    });
    return rows;
  });
}

export async function addFavorite(ctx: ShellContext, actionId: string): Promise<FavoriteRow> {
  if (!findFavoritableById(actionId)) {
    throw new Error(`Unknown manifest action id: ${actionId}`);
  }
  return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
    // Insert with position = MAX(position) + 1, atomically. Race-safe under
    // the unique (user_id, tenant_id, action_id) constraint: a duplicate
    // insert throws and the caller can ignore-on-conflict.
    const max = await tx.userFavorite.aggregate({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
      _max: { position: true },
    });
    const nextPos = (max._max.position ?? -1) + 1;
    const row = await tx.userFavorite.upsert({
      where: {
        userId_tenantId_actionId: {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          actionId,
        },
      },
      create: {
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        actionId,
        position: nextPos,
      },
      update: {}, // already favorited — no-op
      select: { actionId: true, position: true, createdAt: true },
    });
    return row;
  });
}

export async function removeFavorite(ctx: ShellContext, actionId: string): Promise<void> {
  await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
    await tx.userFavorite.deleteMany({
      where: { userId: ctx.userId, tenantId: ctx.tenantId, actionId },
    });
  });
}

export async function reorderFavorites(
  ctx: ShellContext,
  orderedActionIds: string[]
): Promise<void> {
  // Validate inputs first so a typo doesn't half-apply.
  for (const id of orderedActionIds) {
    if (!findFavoritableById(id)) {
      throw new Error(`Unknown manifest action id: ${id}`);
    }
  }
  await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
    // Two-phase rewrite to side-step the unique (user_id, tenant_id, position)
    // index check that would fire during in-place shuffling:
    //   1. Set every row's position to -1 * (idx + 1)
    //   2. Set final positions
    // The negative interim is unique within the user/tenant set and avoids
    // colliding with the target positions.
    for (let i = 0; i < orderedActionIds.length; i += 1) {
      const id = orderedActionIds[i];
      if (!id) continue;
      await tx.userFavorite.updateMany({
        where: { userId: ctx.userId, tenantId: ctx.tenantId, actionId: id },
        data: { position: -(i + 1) },
      });
    }
    for (let i = 0; i < orderedActionIds.length; i += 1) {
      const id = orderedActionIds[i];
      if (!id) continue;
      await tx.userFavorite.updateMany({
        where: { userId: ctx.userId, tenantId: ctx.tenantId, actionId: id },
        data: { position: i },
      });
    }
  });
}

// ── Recents ───────────────────────────────────────────────

export interface RecentRow {
  actionId: string;
  lastVisitedAt: Date;
}

export async function listRecents(
  ctx: ShellContext,
  limit: number = RECENTS_LIMIT
): Promise<RecentRow[]> {
  return withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
    return tx.userRecent.findMany({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
      orderBy: { lastVisitedAt: 'desc' },
      take: limit,
      select: { actionId: true, lastVisitedAt: true },
    });
  });
}

export async function recordVisit(ctx: ShellContext, actionId: string): Promise<void> {
  if (!findFavoritableById(actionId)) {
    // Silently ignore visits to non-manifest routes — they're not surfaceable
    // in the Recents UI anyway, and writing them would just bloat the table.
    return;
  }
  await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
    await tx.userRecent.upsert({
      where: {
        userId_tenantId_actionId: {
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          actionId,
        },
      },
      create: { userId: ctx.userId, tenantId: ctx.tenantId, actionId },
      update: { lastVisitedAt: new Date() },
    });
  });
}

export async function clearRecents(ctx: ShellContext): Promise<void> {
  await withTenant({ tenantId: ctx.tenantId, userId: ctx.userId }, async (tx) => {
    await tx.userRecent.deleteMany({
      where: { userId: ctx.userId, tenantId: ctx.tenantId },
    });
  });
}
