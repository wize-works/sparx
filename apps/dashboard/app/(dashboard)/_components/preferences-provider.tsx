'use client';

import * as React from 'react';
import { DEFAULT_PREFERENCES, type UserPreferences } from '../_shell/preferences';

// Client-side context for the user's preferences bag. Mounted once by the
// DashboardShell with server-fetched values. Any client component below
// the shell can read via `usePreferences()` instead of receiving props.
//
// This avoids prop-drilling preferences through every list page → row
// component → action handler chain.

const PreferencesContext = React.createContext<UserPreferences>(DEFAULT_PREFERENCES);

interface PreferencesProviderProps {
  value: UserPreferences;
  children: React.ReactNode;
}

export function PreferencesProvider({ value, children }: PreferencesProviderProps) {
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): UserPreferences {
  return React.useContext(PreferencesContext);
}
