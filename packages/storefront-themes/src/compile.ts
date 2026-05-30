// Token compilation + the StorefrontTheme write-through map.
//
// `compileTokens` overlays a merchant's per-mode token overrides on top of a
// theme preset's defaults to produce the final { light, dark } token maps that
// publishing snapshots into SiteVersion.compiledTokens. The light subset that
// has a matching StorefrontTheme column is written through on publish so the
// storefront's existing read path keeps working.

import type { ThemeKey, ThemePreset, ThemeOverlay, ThemeTokens, CompiledTokens } from './types';
import { TOKEN_KEYS } from './tokens';
import { THEMES, DEFAULT_THEME_KEY } from './presets';

export function getTheme(key: string): ThemePreset {
  return THEMES[key as ThemeKey] ?? THEMES[DEFAULT_THEME_KEY];
}

export function isThemeKey(key: string): key is ThemeKey {
  return key in THEMES;
}

// Keep only recognized token keys from an untrusted partial (the overlay comes
// from JSONB, so a stray key shouldn't leak into the compiled output).
function pickKnown(partial: Partial<ThemeTokens> | undefined): Partial<ThemeTokens> {
  if (!partial) return {};
  const out: Partial<ThemeTokens> = {};
  for (const key of TOKEN_KEYS) {
    const v = partial[key];
    if (typeof v === 'string' && v !== '') out[key] = v;
  }
  return out;
}

/**
 * Merge a theme preset's defaults with a merchant overlay → final tokens per
 * mode. Unknown overlay keys are dropped; missing overlay values fall back to
 * the preset default so the output is always a complete ThemeTokens map.
 */
export function compileTokens(themeKey: string, overlay?: ThemeOverlay): CompiledTokens {
  const preset = getTheme(themeKey);
  return {
    light: { ...preset.tokenDefaults.light, ...pickKnown(overlay?.light) },
    dark: { ...preset.tokenDefaults.dark, ...pickKnown(overlay?.dark) },
  };
}

// Token → StorefrontTheme column. The light values for these tokens are
// written through to the commerce-owned commerce_storefront_themes row on
// publish. Tokens NOT listed here (colorForeground, colorBorder,
// containerWidth) have no column and reach the storefront only via the
// Site Builder public snapshot.
export const STOREFRONT_THEME_WRITETHROUGH: { token: keyof ThemeTokens; column: string }[] = [
  { token: 'colorPrimary', column: 'colorPrimary' },
  { token: 'colorPrimaryForeground', column: 'colorPrimaryForeground' },
  { token: 'colorAccent', column: 'colorAccent' },
  { token: 'colorBackground', column: 'colorBackground' },
  { token: 'colorMuted', column: 'colorMuted' },
  { token: 'fontHeading', column: 'fontHeading' },
  { token: 'fontBody', column: 'fontBody' },
  { token: 'radiusBase', column: 'radiusBase' },
];

/**
 * Projects a compiled light token map onto the StorefrontTheme column shape
 * for the write-through upsert performed by the publish service.
 */
export function toStorefrontThemeColumns(lightTokens: ThemeTokens): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { token, column } of STOREFRONT_THEME_WRITETHROUGH) {
    const v = lightTokens[token];
    if (typeof v === 'string' && v !== '') out[column] = v;
  }
  return out;
}
