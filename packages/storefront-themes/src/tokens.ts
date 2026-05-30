// The canonical storefront token surface.
//
// A "theme token" is a logical design value (a color, a font, a radius) that
// every theme provides for both light and dark. Tokens bind to one or more
// CSS custom properties on the storefront via `tokensToCssVars` — the same
// `--sf-*` variable names the storefront's app/storefront.css already reads,
// so a token override cascades into every component (incl. @sparx/ui) without
// per-merchant code.
//
// A subset of tokens maps 1:1 onto the commerce-owned `StorefrontTheme`
// columns; publishing write-throughs that subset (see STOREFRONT_THEME_WRITETHROUGH
// in compile.ts) so the existing storefront read path keeps working for
// tenants that aren't yet rendering the full Site Builder snapshot.

export type ThemeTokenKey =
  | 'colorPrimary'
  | 'colorPrimaryForeground'
  | 'colorAccent'
  | 'colorBackground'
  | 'colorForeground'
  | 'colorMuted'
  | 'colorBorder'
  | 'fontHeading'
  | 'fontBody'
  | 'radiusBase'
  | 'containerWidth';

export type ThemeTokens = Record<ThemeTokenKey, string>;

export const TOKEN_KEYS: readonly ThemeTokenKey[] = [
  'colorPrimary',
  'colorPrimaryForeground',
  'colorAccent',
  'colorBackground',
  'colorForeground',
  'colorMuted',
  'colorBorder',
  'fontHeading',
  'fontBody',
  'radiusBase',
  'containerWidth',
] as const;

// Token → CSS custom properties it drives. Mirrors (and extends) the VAR_MAP
// in apps/storefront/lib/theme.ts so light and dark share one mapping.
export const TOKEN_CSS_VARS: Record<ThemeTokenKey, readonly string[]> = {
  colorPrimary: ['--sf-primary', '--sparx-primary', '--color-action-primary'],
  colorPrimaryForeground: ['--sf-on-primary'],
  colorAccent: ['--sf-accent'],
  colorBackground: ['--sf-bg', '--color-bg-page'],
  colorForeground: ['--sf-fg', '--color-text-primary'],
  colorMuted: ['--sf-bg-subtle', '--color-bg-subtle'],
  colorBorder: ['--sf-border', '--color-border-default'],
  fontHeading: ['--sf-font-heading'],
  fontBody: ['--sf-font-body', '--font-sans'],
  radiusBase: ['--sf-radius'],
  containerWidth: ['--sf-container'],
};

// Named container widths → the CSS max-width they compile to.
export const CONTAINER_WIDTHS: Record<string, string> = {
  narrow: '52rem',
  medium: '72rem',
  wide: '90rem',
  full: '100%',
};

// A font *name* needs a fallback stack so a missing webfont still renders.
const FONT_FALLBACK = 'var(--sf-font-fallback, system-ui, -apple-system, sans-serif)';

function isFontToken(key: ThemeTokenKey): boolean {
  return key === 'fontHeading' || key === 'fontBody';
}

function tokenCssValue(key: ThemeTokenKey, raw: string): string {
  if (isFontToken(key)) {
    return `'${raw.replace(/'/g, '')}', ${FONT_FALLBACK}`;
  }
  if (key === 'containerWidth') {
    return CONTAINER_WIDTHS[raw] ?? raw;
  }
  return raw;
}

/**
 * Flattens a token map into the `cssVar → value` declarations for one mode.
 * Used by the storefront to build `:root{…}` (light) and `[data-theme="dark"]{…}`.
 */
export function tokensToCssVars(tokens: Partial<ThemeTokens>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of TOKEN_KEYS) {
    const raw = tokens[key];
    if (raw == null || raw === '') continue;
    const value = tokenCssValue(key, raw);
    for (const cssVar of TOKEN_CSS_VARS[key]) out[cssVar] = value;
  }
  return out;
}

/**
 * Serializes token declarations into a CSS block body (no selector).
 * `tokensToCss(tokens)` → `--sf-primary:#fff;--sf-bg:#000;…`
 */
export function tokensToCss(tokens: Partial<ThemeTokens>): string {
  const vars = tokensToCssVars(tokens);
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
}
