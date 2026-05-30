// Storefront theme → CSS custom properties.
//
// The default theme lives entirely in app/storefront.css as `--sf-*` tokens
// (themselves derived from @sparx/ui's tokens.css). A merchant's
// StorefrontTheme row overrides a handful of those tokens at :root via a
// <style> tag injected in the root layout. Anything the merchant hasn't
// customized stays null here and the default token wins — zero code changes
// per merchant.

import { resolvePreset } from './theme-registry';
import type { TenantTheme } from './tenant';

// Maps a StorefrontTheme field → the CSS variable(s) it overrides. A single
// override (e.g. colorPrimary) cascades into every place that reads the token,
// including @sparx/ui components, because they share the same variable names.
const VAR_MAP: Record<keyof TenantTheme, string[]> = {
  colorPrimary: ['--sf-primary', '--sparx-primary', '--color-action-primary'],
  colorPrimaryForeground: ['--sf-on-primary'],
  colorAccent: ['--sf-accent'],
  colorBackground: ['--sf-bg', '--color-bg-page'],
  colorMuted: ['--sf-bg-subtle', '--color-bg-subtle'],
  fontHeading: ['--sf-font-heading'],
  fontBody: ['--sf-font-body', '--font-sans'],
  radiusBase: ['--sf-radius'],
  // Media ids aren't CSS — handled separately by the layout (logo/favicon).
  logoMediaId: [],
  logoDarkMediaId: [],
  faviconMediaId: [],
};

// A font *name* needs a fallback stack so a missing webfont still renders.
function fontValue(name: string): string {
  return `'${name.replace(/'/g, '')}', var(--sf-font-fallback)`;
}

/**
 * Builds the `:root { … }` override body for a tenant theme. Returns an empty
 * string when the merchant hasn't customized anything — the default tokens in
 * storefront.css then apply unchanged.
 */
export function themeToCss(theme: TenantTheme | null): string {
  if (!theme) return '';
  const decls: string[] = [];
  for (const [field, vars] of Object.entries(VAR_MAP) as [keyof TenantTheme, string[]][]) {
    const raw = theme[field];
    if (raw == null || raw === '' || vars.length === 0) continue;
    const value = field === 'fontHeading' || field === 'fontBody' ? fontValue(raw) : raw;
    for (const cssVar of vars) decls.push(`${cssVar}:${value};`);
  }
  if (decls.length === 0) return '';
  return `:root{${decls.join('')}}`;
}
