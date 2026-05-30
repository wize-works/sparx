import 'server-only';
import { findFavoritableById } from './registry';
import { api } from '@/lib/api-rest-client';

// Dashboard shell — favorites + recents.
//
// Phase 2: these used to talk to Prisma directly through `withTenant`. They
// now forward to api-rest (`/v1/me/favorites`, `/v1/me/recents`), keeping the
// same exported function shape so every caller (layout, Server Actions,
// _components/*) is unchanged. The `ShellContext` argument is preserved for
// signature compatibility — api-rest derives userId / tenantId from the JWT,
// so the ctx is no longer threaded through. Manifest-id validation stays
// client-side because the registry is presentation metadata; api-rest
// happily stores any string id.

export interface ShellContext {
  userId: string;
  tenantId: string;
}

const RECENTS_LIMIT = 20;

export interface FavoriteRow {
  actionId: string;
  position: number;
  createdAt: string;
}

export async function listFavorites(_ctx: ShellContext): Promise<FavoriteRow[]> {
  return api.get<FavoriteRow[]>('/v1/me/favorites');
}

export async function addFavorite(_ctx: ShellContext, actionId: string): Promise<FavoriteRow> {
  if (!findFavoritableById(actionId)) {
    throw new Error(`Unknown manifest action id: ${actionId}`);
  }
  return api.post<FavoriteRow>('/v1/me/favorites', { actionId });
}

export async function removeFavorite(_ctx: ShellContext, actionId: string): Promise<void> {
  await api.delete<void>(`/v1/me/favorites/${encodeURIComponent(actionId)}`);
}

export async function reorderFavorites(
  _ctx: ShellContext,
  orderedActionIds: string[]
): Promise<void> {
  for (const id of orderedActionIds) {
    if (!findFavoritableById(id)) {
      throw new Error(`Unknown manifest action id: ${id}`);
    }
  }
  await api.put<{ reordered: number }>('/v1/me/favorites/order', { orderedActionIds });
}

export interface RecentRow {
  actionId: string;
  lastVisitedAt: string;
}

export async function listRecents(
  _ctx: ShellContext,
  limit: number = RECENTS_LIMIT
): Promise<RecentRow[]> {
  return api.get<RecentRow[]>(`/v1/me/recents?take=${limit}`);
}

export async function recordVisit(_ctx: ShellContext, actionId: string): Promise<void> {
  if (!findFavoritableById(actionId)) {
    // Silently ignore visits to non-manifest routes — they wouldn't render
    // in the Recents UI and we don't want to bloat the table with them.
    return;
  }
  await api.post<{ recorded: boolean }>('/v1/me/recents', { actionId });
}

export async function clearRecents(_ctx: ShellContext): Promise<void> {
  await api.delete<void>('/v1/me/recents');
}
