import 'server-only';
import { prisma, type Prisma } from '@sparx/db';
import {
  DEFAULT_PREFERENCES,
  parsePreferences,
  type UserPreferences,
} from './preferences-types';

// Server-only DB access for per-user preferences. Client modules should
// import types from `./preferences-types` instead — see the comment there.

export { DEFAULT_PREFERENCES };
export type { DefaultDetailView, UserPreferences } from './preferences-types';

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  return parsePreferences(row?.preferences);
}

export async function setUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getUserPreferences(userId);
  const next: UserPreferences = { ...current, ...patch };
  await prisma.user.update({
    where: { id: userId },
    data: { preferences: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}
