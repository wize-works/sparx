import 'server-only';
import { api } from '@/lib/api-rest-client';
import { DEFAULT_PREFERENCES, type UserPreferences } from './preferences-types';

// Per-user preferences. Used to talk to Prisma directly; now forwards to
// api-rest (`/v1/me/preferences`). Client modules should import types from
// `./preferences-types` instead of this file — see the comment there.

export { DEFAULT_PREFERENCES };
export type { DefaultDetailView, DefaultListView, UserPreferences } from './preferences-types';

export async function getUserPreferences(_userId?: string): Promise<UserPreferences> {
  // `/v1/me/preferences` resolves the current user from the request session,
  // so the userId arg is unused — kept for call-site clarity. Server pages can
  // call it with no args to read the preference bag (e.g. the list view).
  return api.get<UserPreferences>('/v1/me/preferences');
}

export async function setUserPreferences(
  _userId: string,
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  return api.patch<UserPreferences>('/v1/me/preferences', patch);
}
