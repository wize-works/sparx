// Email design tokens. Hex strings (no CSS variables) because mail clients
// strip <style> blocks — every value here ends up inlined on the rendered
// element. Mirrors the @sparx/ui tokens conceptually but is intentionally a
// separate, smaller surface area: emails have a fixed monochrome chrome and
// a single accent.

export const colors = {
  brand: '#6366F1', // Sparx Indigo — accent only, never large fills.
  textPrimary: '#0F172A',
  textMuted: '#64748B',
  textInverse: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E2E8F0',
  // Callout backgrounds — light tints, must stay readable under dark-mode
  // mail client overrides (Gmail forces background contrast, so keep these
  // pale enough that an inverted readout still works).
  calloutInfoBg: '#EEF2FF',
  calloutWarnBg: '#FEF3C7',
  calloutSuccessBg: '#ECFDF5',
} as const;

// Typography scale. `lineHeight` is in px so mail clients don't interpret
// the unitless number as a ratio against client-injected font sizes.
export const typography = {
  heading: {
    fontSize: 20,
    fontWeight: 500,
    lineHeight: '28px',
    letterSpacing: '-0.01em',
  },
  subheading: {
    fontSize: 16,
    fontWeight: 500,
    lineHeight: '24px',
  },
  body: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: '22px',
  },
  muted: {
    fontSize: 12,
    fontWeight: 400,
    lineHeight: '18px',
  },
} as const;

export const radius = {
  button: 6,
  callout: 8,
} as const;

// Vertical rhythm. Most spacing in emails reads better as multiples of 8.
export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const fontFamily = 'Helvetica, Arial, sans-serif';
