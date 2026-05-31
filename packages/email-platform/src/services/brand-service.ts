// brandService — resolves a tenant's email brand (the BrandTokens that
// @sparx/email threads through every template/atom).
//
// Brand is the tenant-level source of truth (docs/30 §6): email READS it, never
// overrides it. We read `TenantBrand` directly — the old cascade (Commerce
// StorefrontTheme → EmailSettings.brandingOverride → defaults) is gone; those
// sources were consolidated into TenantBrand by migration 20260610000000 and
// `brandingOverride` is removed. The brand's identity palette/typography overlay
// the default theme preset; unset tokens fall back to the preset, and a tenant
// with no brand identity at all yields null (caller renders @sparx/email's
// Sparx defaultBrand).
//
// Light palette only (email-client dark mode is unreliable). We read concrete
// token values — never CSS custom properties — because React Email inlines
// styles and `var(--…)` doesn't survive in Gmail/Outlook. Theme compilation is
// delegated to @sparx/storefront-themes; we never fork a second registry.

import { withTenant } from '@sparx/db';
import {
  brandIdentityOverlay,
  compileTokens,
  DEFAULT_THEME_KEY,
  type ThemeTokens,
} from '@sparx/storefront-themes';
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

/**
 * Resolve the tenant's email brand, or `null` when the tenant has no brand
 * identity set (the caller then renders with @sparx/email's Sparx defaults).
 */
export async function resolveEmailBrand(ctx: ServiceContext): Promise<BrandTokens | null> {
  return withTenant(ctx, async (tx) => {
    const [brand, tenant] = await Promise.all([
      tx.tenantBrand.findUnique({ where: { tenantId: ctx.tenantId } }),
      tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true, slug: true } }),
    ]);

    // A tenant with no brand record → Sparx defaults (null signals "use
    // @sparx/email's defaultBrand"). Guarding here also narrows `brand` to
    // non-null for the rest of the function.
    if (brand === null) return null;

    const slug = tenant?.slug ?? '';
    const storeName = brand.businessName ?? tenant?.name ?? undefined;

    // Likewise a brand row with no identity tokens at all → defaults.
    const hasIdentity = [
      brand.businessName,
      brand.colorPrimary,
      brand.colorPrimaryForeground,
      brand.colorAccent,
      brand.fontHeading,
      brand.fontBody,
      brand.logoLightMediaId,
    ].some(Boolean);
    if (!hasIdentity) return null;

    // Overlay the brand's identity palette/typography over the default preset;
    // unset tokens inherit the preset. Email uses the light palette only. Same
    // brand→token mapping the storefront uses (shared in @sparx/storefront-themes).
    const overlay = brandIdentityOverlay(brand);
    const compiled = compileTokens(DEFAULT_THEME_KEY, { light: overlay }).light;
    return tokensToBrand(compiled, {
      logoUrl: logoUrlFor(brand.logoLightMediaId, slug),
      storeName,
    });
  });
}
