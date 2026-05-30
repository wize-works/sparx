import 'server-only';
import { prisma, type Prisma } from '@sparx/db';

// Per-user preferences. Stored as a JSON bag on User.preferences; the
// TypeScript shape here is the canonical contract. Unknown keys read from
// the DB are tolerated (returned but unused); missing keys fall back to
// defaults below.

export type DefaultDetailView = 'drawer' | 'modal' | 'fullPage' | 'newTab';

export interface UserPreferences {
  defaultDetailView: DefaultDetailView;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultDetailView: 'drawer',
};

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

function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFERENCES;
  const obj = raw as Record<string, unknown>;
  const view = obj.defaultDetailView;
  const valid: DefaultDetailView[] = ['drawer', 'modal', 'fullPage', 'newTab'];
  return {
    defaultDetailView: valid.includes(view as DefaultDetailView)
      ? (view as DefaultDetailView)
      : DEFAULT_PREFERENCES.defaultDetailView,
  };
}
