'use client';

import * as React from 'react';

export type SparxModule =
  | 'storefront'
  | 'commerce'
  | 'cms'
  | 'crm'
  | 'email'
  | 'b2b'
  | 'ai'
  | 'dropship'
  | 'platform';

interface ModuleColors {
  color: string;
  tint: string;
  text: string;
}

const MODULE_COLORS: Record<SparxModule, ModuleColors> = {
  storefront: { color: '#6366F1', tint: '#EEF2FF', text: '#4338CA' },
  commerce: { color: '#F97316', tint: '#FFF7ED', text: '#C2410C' },
  cms: { color: '#14B8A6', tint: '#F0FDFA', text: '#0F766E' },
  crm: { color: '#06B6D4', tint: '#ECFEFF', text: '#0E7490' },
  email: { color: '#0EA5E9', tint: '#F0F9FF', text: '#0369A1' },
  b2b: { color: '#475569', tint: '#F1F5F9', text: '#334155' },
  ai: { color: '#EC4899', tint: '#FDF2F8', text: '#9D174D' },
  dropship: { color: '#10B981', tint: '#ECFDF5', text: '#065F46' },
  platform: { color: '#6366F1', tint: '#EEF2FF', text: '#4338CA' },
};

const ModuleContext = React.createContext<SparxModule>('platform');

interface ModuleProviderProps {
  module: SparxModule;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function ModuleProvider({ module, children, className, style }: ModuleProviderProps) {
  const colors = MODULE_COLORS[module];

  const cssVars = React.useMemo(
    () =>
      ({
        '--module-active': colors.color,
        '--module-active-tint': colors.tint,
        '--module-active-text': colors.text,
      }) as React.CSSProperties,
    [colors]
  );

  return (
    <ModuleContext.Provider value={module}>
      <div style={{ ...cssVars, ...style }} className={className} data-module={module}>
        {children}
      </div>
    </ModuleContext.Provider>
  );
}

export function useModule(): SparxModule {
  return React.useContext(ModuleContext);
}
