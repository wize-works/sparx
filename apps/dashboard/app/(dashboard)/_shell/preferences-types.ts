// Client-safe portion of the per-user preferences contract.
//
// Lives in its own module so the client `PreferencesProvider` can import the
// shape without dragging the `server-only` DB code (preferences.ts) into the
// client graph. Same pattern as the detail-registry / detail-slot split.

export type DefaultDetailView = 'drawer' | 'modal' | 'fullPage' | 'newTab';

export interface UserPreferences {
  defaultDetailView: DefaultDetailView;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultDetailView: 'drawer',
};

const VALID_VIEWS: DefaultDetailView[] = ['drawer', 'modal', 'fullPage', 'newTab'];

// Parses an unknown JSON blob (the raw value of `User.preferences`) into a
// validated UserPreferences. Pure / client-safe — no DB access.
export function parsePreferences(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFERENCES;
  const obj = raw as Record<string, unknown>;
  const view = obj.defaultDetailView;
  return {
    defaultDetailView: VALID_VIEWS.includes(view as DefaultDetailView)
      ? (view as DefaultDetailView)
      : DEFAULT_PREFERENCES.defaultDetailView,
  };
}
