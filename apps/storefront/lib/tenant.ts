// Tenant resolution from the incoming Host header.
//
// Three lookup orders, in priority:
//   1. Exact match on `tenants.primary_domain`           (e.g. acme.com)
//   2. Subdomain of sparx.zone                           (e.g. acme.sparx.zone → slug=acme)
//   3. Query-param fallback for local dev                (?tenant=foo)
//
// The api-rest endpoint /v1/public/tenants/:slug accepts a slug, so case 1
// would technically need a second endpoint that resolves by primary_domain.
// That's deferred — for now we only handle case 2 (subdomain) and case 3
// (dev fallback). Custom domains land when merchants need them.
//
// The tenant payload now also carries the merchant's storefront THEME and
// commerce DEFAULTS so the root layout resolves colors/fonts/currency in a
// single fetch (see app/layout.tsx + lib/theme.ts).

import { headers } from 'next/headers';
import { cache } from 'react';

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';
const ZONE_DOMAIN = process.env.SPARX_ZONE_DOMAIN ?? 'sparx.zone';

/** Per-tenant theme overrides. Every field is nullable — null means "fall
 *  back to the default theme token" (see lib/theme.ts). Mirrors the
 *  StorefrontTheme model. */
export interface TenantTheme {
  colorPrimary: string | null;
  colorPrimaryForeground: string | null;
  colorAccent: string | null;
  colorBackground: string | null;
  colorMuted: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  radiusBase: string | null;
  logoMediaId: string | null;
  logoDarkMediaId: string | null;
  faviconMediaId: string | null;
}

/** Commerce-relevant storefront defaults (currency, locale, gating). */
export interface TenantStorefront {
  defaultCurrency: string;
  defaultLocale: string;
  showStockBelow: number;
  hidePricesWhenSignedOut: boolean;
  requireAuthForCheckout: boolean;
}

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
  theme: TenantTheme | null;
  storefront: TenantStorefront;
}

// The API also returns `businessName` (the tenant-level brand display name,
// docs/30 §6). We collapse it into `name` at this boundary so every storefront
// surface (header, footer, title, hero) shows the brand name with zero extra
// wiring, falling back to the legal tenant name when brand has none set.
interface TenantApiResponse {
  success: boolean;
  data?: ResolvedTenant & { businessName?: string | null };
  error?: { code: string; message: string };
}

const DEFAULT_STOREFRONT: TenantStorefront = {
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
  showStockBelow: 10,
  hidePricesWhenSignedOut: false,
  requireAuthForCheckout: false,
};

// Extracts the tenant slug from a host like `acme.sparx.zone` → `acme`.
// Returns null when the host isn't a sparx.zone subdomain. Strips port.
export function slugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const noPort = host.split(':')[0]?.toLowerCase();
  if (!noPort) return null;
  const suffix = `.${ZONE_DOMAIN}`;
  if (noPort === ZONE_DOMAIN) return null;
  if (!noPort.endsWith(suffix)) return null;
  const sub = noPort.slice(0, -suffix.length);
  // Reject deeper subdomains (foo.bar.sparx.zone) — only single-level for now.
  if (sub.includes('.') || sub.length === 0) return null;
  return sub;
}

// Resolves the active slug: Host subdomain first, then a `?tenant=` / header
// dev fallback so `localhost:3004/?tenant=acme` works without DNS.
async function resolveSlug(): Promise<string | null> {
  const hdrs = await headers();
  // Middleware stashes the dev-fallback slug here so Server Components can
  // read it without re-parsing searchParams on every page.
  const fromHeader = hdrs.get('x-tenant-slug');
  if (fromHeader) return fromHeader;
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  return slugFromHost(host);
}

// Cached per-request so layout + page can both resolve the tenant without a
// double fetch. React.cache() dedupes within a single server render.
export const resolveTenant = cache(async (): Promise<ResolvedTenant | null> => {
  const slug = await resolveSlug();
  if (!slug) return null;

  try {
    const res = await fetch(`${BASE_URL}/v1/public/tenants/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300, tags: [`tenant:${slug}`] },
    });
    const json = (await res.json()) as TenantApiResponse;
    if (!res.ok || !json.success || !json.data) return null;
    const { businessName, ...data } = json.data;
    const display = businessName?.trim();
    return {
      ...data,
      name: display && display.length > 0 ? display : data.name,
      storefront: data.storefront ?? DEFAULT_STOREFRONT,
    };
  } catch {
    return null;
  }
});
