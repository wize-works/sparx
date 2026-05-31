'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@sparx/auth';
import {
  addFavorite as svcAddFavorite,
  clearRecents as svcClearRecents,
  listFavorites as svcListFavorites,
  listRecents as svcListRecents,
  recordVisit as svcRecordVisit,
  removeFavorite as svcRemoveFavorite,
  reorderFavorites as svcReorderFavorites,
  type FavoriteRow,
  type RecentRow,
} from './service';
import {
  getUserPreferences as svcGetUserPreferences,
  setUserPreferences as svcSetUserPreferences,
  type DefaultDetailView,
  type DefaultListView,
  type UserPreferences,
} from './preferences';

// Server Actions wrapping the shell service. Every action gates on
// requireSession() and uses the session's userId/tenantId — clients never
// pass these. Revalidation triggers a sidebar refresh on mutations.

async function ctxFromSession() {
  const { user } = await requireSession();
  return { userId: user.id, tenantId: user.tenantId };
}

export async function getFavoritesAction(): Promise<FavoriteRow[]> {
  const ctx = await ctxFromSession();
  return svcListFavorites(ctx);
}

export async function addFavoriteAction(actionId: string): Promise<FavoriteRow> {
  const ctx = await ctxFromSession();
  const row = await svcAddFavorite(ctx, actionId);
  // The sidebar Favorites section reads server-rendered data, so we revalidate
  // the entire (dashboard) tree on any favorites mutation.
  revalidatePath('/', 'layout');
  return row;
}

export async function removeFavoriteAction(actionId: string): Promise<void> {
  const ctx = await ctxFromSession();
  await svcRemoveFavorite(ctx, actionId);
  revalidatePath('/', 'layout');
}

export async function reorderFavoritesAction(orderedActionIds: string[]): Promise<void> {
  const ctx = await ctxFromSession();
  await svcReorderFavorites(ctx, orderedActionIds);
  revalidatePath('/', 'layout');
}

export async function getRecentsAction(limit?: number): Promise<RecentRow[]> {
  const ctx = await ctxFromSession();
  return svcListRecents(ctx, limit);
}

export async function recordVisitAction(actionId: string): Promise<void> {
  const ctx = await ctxFromSession();
  await svcRecordVisit(ctx, actionId);
  // Don't revalidate on every nav — recents update is high-frequency and
  // the sidebar reads it explicitly when it needs to.
}

export async function clearRecentsAction(): Promise<void> {
  const ctx = await ctxFromSession();
  await svcClearRecents(ctx);
  revalidatePath('/', 'layout');
}

// ── Preferences ───────────────────────────────────────────

export async function getUserPreferencesAction(): Promise<UserPreferences> {
  const ctx = await ctxFromSession();
  return svcGetUserPreferences(ctx.userId);
}

export async function setDefaultDetailViewAction(
  next: DefaultDetailView
): Promise<UserPreferences> {
  const ctx = await ctxFromSession();
  const result = await svcSetUserPreferences(ctx.userId, { defaultDetailView: next });
  // Click-handlers throughout the dashboard read preferences from the
  // server-rendered shell, so a preference change must rebuild the layout
  // tree. Same revalidation pattern as favorites.
  revalidatePath('/', 'layout');
  return result;
}

export async function setDefaultListViewAction(next: DefaultListView): Promise<UserPreferences> {
  const ctx = await ctxFromSession();
  const result = await svcSetUserPreferences(ctx.userId, { defaultListView: next });
  // List pages read the preference server-side to pick table vs card rendering,
  // so rebuild the layout tree on change — same pattern as the detail view.
  revalidatePath('/', 'layout');
  return result;
}
