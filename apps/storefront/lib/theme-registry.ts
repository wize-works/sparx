// Storefront theme registry — named base themes the engine can select between.
//
// The design system's defaults live in storefront.css `:root`. A *preset* is a
// named bundle of token overrides layered on top of those defaults; a merchant's
// own StorefrontTheme overrides then layer on top of the preset. Resolution
// order (later wins):
//
//   storefront.css :root  →  preset tokens  →  merchant overrides
//
// Adding a new theme is purely additive: drop another entry in PRESETS, no other
// code changes. The active preset id comes from tenant settings
// (`settings.theme.preset`); unknown/unset falls back to 'classic'.

/** The merchant-overridable token fields (mirror of theme.ts TOKEN_MAP keys). */
export type ThemeTokenField =
  | 'colorPrimary'
  | 'colorPrimaryForeground'
  | 'colorAccent'
  | 'colorBackground'
  | 'colorMuted'
  | 'fontHeading'
  | 'fontBody'
  | 'radiusBase';

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  tokens: Partial<Record<ThemeTokenField, string>>;
}

export const DEFAULT_PRESET_ID = 'classic';

export const PRESETS: Record<string, ThemePreset> = {
  // Classic = the design-system defaults. Empty token set so storefront.css
  // :root governs; present as a named option for the theme picker.
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'The default Sparx storefront look — balanced, neutral, versatile.',
    tokens: {},
  },
  // Bold = high-contrast, squared, confident type.
  bold: {
    id: 'bold',
    name: 'Bold',
    description: 'High-contrast and squared off, for brands that want to shout.',
    tokens: {
      colorPrimary: '#111111',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#ff4d2e',
      radiusBase: '0px',
      fontHeading: "'Geist', system-ui, sans-serif",
    },
  },
  // Minimal = soft, airy, rounded.
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Soft, airy, and rounded — lets the products do the talking.',
    tokens: {
      colorPrimary: '#3d3d3d',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#8a7355',
      colorBackground: '#fafaf8',
      radiusBase: '14px',
    },
  },
};

/** Resolve a preset by id, falling back to the default. Always returns a preset. */
export function resolvePreset(id: string | null | undefined): ThemePreset {
  return (id && PRESETS[id]) || PRESETS[DEFAULT_PRESET_ID]!;
}
