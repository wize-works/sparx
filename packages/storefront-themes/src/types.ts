// Theme preset shapes. A ThemePreset is the code-side equivalent of the PRD's
// theme.json: metadata + the settings schema the customizer renders + the
// light/dark token defaults + the section types it ships.

import type { ThemeTokens, ThemeTokenKey } from './tokens';

export type ThemeKey = 'apex' | 'industrial' | 'drift' | 'market' | 'fleet' | 'drop';

export type ThemeCategory = 'general' | 'b2b' | 'fashion' | 'food' | 'fleet' | 'dropship';

export type SettingFieldType = 'color' | 'font' | 'select' | 'text' | 'number' | 'boolean';

export type SettingGroup = 'colors' | 'typography' | 'layout';

// One editable setting in the customizer. `key` is a ThemeTokenKey when the
// field writes a token; `perMode` colors are edited once per light/dark.
export interface ThemeSettingField {
  key: ThemeTokenKey;
  label: string;
  type: SettingFieldType;
  group: SettingGroup;
  // Colors are edited per light/dark palette; fonts/layout are shared.
  perMode: boolean;
  options?: { label: string; value: string }[];
  help?: string;
}

export interface ThemePreset {
  key: ThemeKey;
  name: string;
  category: ThemeCategory;
  description: string;
  version: string;
  // Themes recommended to merchants in this category bucket during onboarding.
  recommendedFor: ThemeCategory[];
  settingsSchema: ThemeSettingField[];
  tokenDefaults: {
    light: ThemeTokens;
    dark: ThemeTokens;
  };
  // Section types this theme ships variants for (registry keys).
  sectionTypes: string[];
}

// Merchant overlay stored in SiteConfig.draftSettings.tokens — a partial token
// map per mode laid over the preset defaults at compile time.
export interface ThemeOverlay {
  light?: Partial<ThemeTokens>;
  dark?: Partial<ThemeTokens>;
}

export interface CompiledTokens {
  light: ThemeTokens;
  dark: ThemeTokens;
}

export type { ThemeTokens, ThemeTokenKey };
