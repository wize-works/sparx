// Storefront theme → CSS custom properties (Token Model v2, docs/33).
//
// The default theme lives in app/storefront.css as `--sf-*` token fallbacks. A
// per-tenant <style> tag injected in the root layout overrides them with the
// compiled v2 theme; anything the merchant hasn't customized falls through to
// the preset / storefront.css default — zero code changes per merchant.

import { buildLegacyThemeCss } from '@sparx/storefront-themes';

import type { TenantTheme } from './tenant';

// ── Token Model v2 render path (docs/33-token-model-v2.md §7 step 3) ─────────
//
// Compile the storefront's CSS through the v2 token engine, sourced from the
// SAME data the layout already fetches — no API/schema change. The heavy v1→v2
// mapping + compile lives in @sparx/storefront-themes' `buildLegacyThemeCss`
// (unit-tested there); here we only project the app's `TenantTheme` shape onto
// its inputs. The emitter outputs the canonical `--sf-*` tokens PLUS the legacy
// aliases the current storefront.css still reads, so the chrome upgrades to v2
// with no CSS rewrite.

interface ThemeV2Sources {
  themeKey: string;
  tenantTheme: TenantTheme | null;
  snapshotTokens?: { light: Record<string, string>; dark: Record<string, string> } | null;
}

/** Build the storefront theme stylesheet from the v2 token engine. */
export function buildStorefrontThemeCss(sources: ThemeV2Sources): string {
  const { themeKey, tenantTheme, snapshotTokens } = sources;
  return buildLegacyThemeCss({
    themeKey,
    brand: tenantTheme
      ? {
          colorPrimary: tenantTheme.colorPrimary,
          colorPrimaryForeground: tenantTheme.colorPrimaryForeground,
          colorAccent: tenantTheme.colorAccent,
          fontHeading: tenantTheme.fontHeading,
          fontBody: tenantTheme.fontBody,
          radiusBase: tenantTheme.radiusBase,
        }
      : null,
    presentationLight: tenantTheme
      ? { colorBackground: tenantTheme.colorBackground, colorMuted: tenantTheme.colorMuted }
      : null,
    snapshotTokens: snapshotTokens ?? null,
  });
}
