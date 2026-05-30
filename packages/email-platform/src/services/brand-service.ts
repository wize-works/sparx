// brandService — resolves a tenant's email brand (the BrandTokens that
// @sparx/email threads through every template/atom). Per the brand directive:
//
//   priority: Site Builder published snapshot (compiledTokens.light)  [not yet
//             exposed — falls through]  →  commerce StorefrontTheme overlay  →
//             EmailSettings.brandingOverride  →  Sparx defaults (null = use
//             @sparx/email's defaultBrand).
//
// Light palette only (email-client dark mode is unreliable). We read concrete
// token values — never CSS custom properties — because React Email inlines
// styles and `var(--…)` doesn't survive in Gmail/Outlook. Theme compilation is
// delegated to @sparx/storefront-themes; we never fork a second registry.

import { withTenant } from '@sparx/db';
import { compileTokens, DEFAULT_THEME_KEY, type ThemeTokens } from '@sparx/storefront-themes';
import type { BrandTokens } from '@sparx/email';

import type { ServiceContext } from '../errors';

const PUBLIC_API_BASE =
  process.env.SPARX_PUBLIC_API_URL ?? process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

// Public, cacheable media redirect (mirrors apps/storefront/lib/media.ts) — an
// absolute URL so an <img> renders in any mail client.
function logoUrlFor(mediaId: string | null | undefined, tenantSlug: string): string | undefined {
  if (!mediaId) return undefined;
  return `${PUBLIC_API_BASE}/v1/public/media/${encodeURIComponent(mediaId)}?tenant=${encodeURIComponent(
    tenantSlug
  )}`;
}

// A font *name* → an email-safe family stack (no webfont reliance).
function fontStack(name: string): string {
  const clean = name.replace(/['"]/g, '').trim();
  if (!clean) return 'Helvetica, Arial, sans-serif';
  return `'${clean}', Arial, Helvetica, sans-serif`;
}

function tokensToBrand(
  tokens: ThemeTokens,
  extras: { logoUrl?: string; storeName?: string }
): BrandTokens {
  return {
    primary: tokens.colorPrimary,
    primaryForeground: tokens.colorPrimaryForeground,
    accent: tokens.colorAccent,
    background: tokens.colorBackground,
    foreground: tokens.colorForeground,
    muted: tokens.colorMuted,
    border: tokens.colorBorder,
    fontHeading: fontStack(tokens.fontHeading),
    fontBody: fontStack(tokens.fontBody),
    ...(extras.logoUrl ? { logoUrl: extras.logoUrl } : {}),
    ...(extras.storeName ? { storeName: extras.storeName } : {}),
  };
}

interface BrandingOverride {
  logoMediaId?: string | null;
  colors?: { primary?: string };
}

/**
 * Resolve the tenant's email brand, or `null` when the tenant has no branding
 * customization (the caller then renders with @sparx/email's Sparx defaults).
 */
export async function resolveEmailBrand(ctx: ServiceContext): Promise<BrandTokens | null> {
  return withTenant(ctx, async (tx) => {
    const [theme, settings, tenant] = await Promise.all([
      tx.storefrontTheme.findUnique({ where: { tenantId: ctx.tenantId } }),
      tx.emailSettings.findUnique({ where: { tenantId: ctx.tenantId } }),
      tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, slug: true } }),
    ]);

    const slug = tenant?.slug ?? '';
    const storeName = tenant?.name ?? undefined;
    const override = (settings?.brandingOverride as BrandingOverride | null) ?? null;

    // 1. Commerce StorefrontTheme → overlay over the default preset.
    if (theme) {
      const overlay: Partial<ThemeTokens> = {};
      if (theme.colorPrimary) overlay.colorPrimary = theme.colorPrimary;
      if (theme.colorPrimaryForeground)
        overlay.colorPrimaryForeground = theme.colorPrimaryForeground;
      if (theme.colorAccent) overlay.colorAccent = theme.colorAccent;
      if (theme.colorBackground) overlay.colorBackground = theme.colorBackground;
      if (theme.colorMuted) overlay.colorMuted = theme.colorMuted;
      if (theme.fontHeading) overlay.fontHeading = theme.fontHeading;
      if (theme.fontBody) overlay.fontBody = theme.fontBody;

      const compiled = compileTokens(DEFAULT_THEME_KEY, { light: overlay }).light;
      return tokensToBrand(compiled, {
        logoUrl: logoUrlFor(theme.logoMediaId ?? override?.logoMediaId, slug),
        storeName,
      });
    }

    // 2. EmailSettings branding override (logo and/or primary color).
    if (override && (override.colors?.primary || override.logoMediaId)) {
      const overlay: Partial<ThemeTokens> = {};
      if (override.colors?.primary) overlay.colorPrimary = override.colors.primary;
      const compiled = compileTokens(DEFAULT_THEME_KEY, { light: overlay }).light;
      return tokensToBrand(compiled, {
        logoUrl: logoUrlFor(override.logoMediaId, slug),
        storeName,
      });
    }

    // 3. No customization → Sparx defaults (null signals "use defaultBrand").
    return null;
  });
}
