// Tenant + site resolution from the incoming Host header.
//
// Resolution order (resolveSiteRoute):
//   1. Dev-fallback headers (`x-tenant-slug` / `x-property-slug`, set by the proxy
//      from `?tenant=` / `?property=` in local dev — no per-tenant DNS needed).
//   2. Our own zone subdomains — every zone in SPARX_ZONE_DOMAINS, one per brand
//      — decoded STRUCTURALLY from the host (zoneSiteRoute):
//      `<tenant>.<zone>` → primary, `<property>.<tenant>.<zone>` → that site.
//      Self-describing, so no API round-trip.
//   3. Arbitrary CUSTOM domains → the domains table via api-rest (fetchSiteByHost).
//
// The tenant payload also carries the tenant's storefront THEME and commerce
// DEFAULTS so the root layout resolves colors/fonts/currency in a single fetch
// (see app/layout.tsx + lib/theme.ts).

import { headers } from 'next/headers';
import { cache } from 'react';
import { DEFAULT_PLATFORM_BRAND, platformBrandIdentity } from '@wizeworks/brand-core';

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';
// ── THE ZONES THIS DEPLOYMENT SERVES ────────────────────────────────────────
//
// More than one, because more than one BRAND publishes tenant sites through this
// renderer. A sparx tenant lives on `<slug>.sparx.zone`; a Piggles tenant lives
// on `<slug>.piggles.site`.
//
// This read the SINGULAR variable and nothing else, so it recognised exactly one
// zone while every other consumer had already learned the list (api-rest's
// lib/domain.ts, the on-demand TLS ask endpoint, both ConfigMaps). The effect was
// not a 404 — provisioning writes a `domains` row for every tenant, so a
// `*.piggles.site` host fell through step 2 and resolved via step 3 instead. It
// cost two things, quietly:
//
//   • an API round-trip on EVERY request to EVERY Piggles tenant site, where the
//     equivalent sparx request is answered from the hostname alone;
//   • the redundancy. The structural decode is also what keeps a zone host
//     working when its `domains` row is missing — an older tenant, a repair, a
//     half-finished migration. sparx had two paths to the same answer and
//     Piggles had one.
//
// Same parsing as api-rest's `OWNED_ZONES`, deliberately: two readers of one
// variable that disagree about its format is its own bug.
const ZONE_LIST = (process.env.SPARX_ZONE_DOMAINS ?? process.env.SPARX_ZONE_DOMAIN ?? 'sparx.zone')
  .split(',')
  .map((zone) => zone.trim().toLowerCase())
  .filter((zone) => zone.length > 0);

/** Every zone this deployment serves tenant sites for, in declaration order. */
const OWNED_ZONES: readonly string[] = ZONE_LIST.length > 0 ? ZONE_LIST : ['sparx.zone'];

/** Per-tenant theme overrides. Every field is nullable — null means "fall
 *  back to the default theme token" (see lib/theme.ts). Mirrors the
 *  CommerceSiteTheme model. */
export interface SiteTheme {
  colorPrimary: string | null;
  colorPrimaryForeground: string | null;
  colorAccent: string | null;
  colorBackground: string | null;
  colorMuted: string | null;
  colorBorder: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  radiusBase: string | null;
  logoMediaId: string | null;
  logoDarkMediaId: string | null;
  faviconMediaId: string | null;
}

/** Commerce-relevant storefront defaults (currency, locale, gating). */
export interface SiteCommerce {
  defaultCurrency: string;
  defaultLocale: string;
  showStockBelow: number;
  hidePricesWhenSignedOut: boolean;
  requireAuthForCheckout: boolean;
  // How this shop can be paid (issue 185). `card` is the only one that takes
  // money on this website; `in_person` settles in the room and `unavailable`
  // takes none at all, so copy about charging a card is false under both.
  // Defaults to `card` for an older api-rest that omits it, which is what every
  // storefront assumed before this was carried.
  paymentMode: 'card' | 'in_person' | 'unavailable';
}

/** Cookie-consent config (docs/42 §4) — travels in the tenant payload so the
 *  layout decides off/quiet-notice/banner server-side with no client flash. */
export interface SiteConsent {
  mode: 'off' | 'gdpr' | 'ccpa';
  categories: string[];
  activeCategories: string[];
  bannerEnabled: boolean;
  bannerTitle: string | null;
  bannerBody: string | null;
  policyPageSlug: string;
  policyVersion: string;
}

export interface ResolvedSite {
  id: string;
  slug: string;
  name: string;
  // The brand tagline (per-site override applied), bound as `site.identity.tagline`
  // by the chrome. Nullable: an older api-rest doesn't return it.
  tagline: string | null;
  settings: Record<string, unknown>;
  theme: SiteTheme | null;
  commerce: SiteCommerce;
  consent: SiteConsent;
  // Site-wide social links (a SITE setting on the tenant, not brand/theme —
  // docs/45 §3): an ordered { platform, url }[] the layout chrome binds
  // `site.social` to.
  socials: { platform: string; url: string }[];
  // How a customer reaches this business (per-site, docs/49): the phone number,
  // the address to write to, and the place to turn up. Bound by the page tree as
  // `site.identity.phone` / `.email` / `.address`. Each is null when unset — an
  // empty string would blank the authored node instead of leaving it standing.
  contact: { phone: string | null; email: string | null; address: string | null };
  // The languages this shop's catalogue is written in, beyond its own words.
  // Derived by api-rest from the translations that actually exist, so a language
  // is here because a real product carries words in it. Empty for almost every
  // shop, which is what makes the language switcher absent rather than empty.
  languages: string[];
  // Whether the always-on platform attribution credit renders for this site.
  // Defaults true; a future merchant toggle can hide it.
  showPlatformCredit: boolean;
  // WHICH platform gets the credit. This renderer serves tenant sites for every
  // brand, so the badge is resolved per tenant rather than compiled in — it said
  // "Made with sparx" on Piggles businesses' public sites until 2026-08-16.
  // Defaults to the platform default for an older api-rest that omits it.
  platformBrand: string;
  // Billing lifecycle phase (docs/17 §6). The layout serves the "site unavailable"
  // overlay when this is 'suspended'; every other phase renders the site normally
  // (a tenant in the grace window keeps a live site). Only the PHASE crosses the
  // wire — never the trial/grace dates — so nothing about the tenant's billing
  // timeline is public. Defaults 'active' for an older api-rest that omits it, so a
  // storefront is NEVER dark on missing data.
  billingPhase: SiteBillingPhase;
}

/** Mirror of @wizeworks/billing's BillingPhase — redeclared locally so the storefront
 *  image doesn't pull the billing/Stripe closure just for a string union. */
export type SiteBillingPhase = 'trialing' | 'active' | 'grace' | 'suspended' | 'exempt';

// `ResolvedSite.name` is the customer-facing SITE name, NOT the tenant's legal/
// org name. The API returns `propertyName` (the active site, else the tenant's
// primary — docs/49); we collapse it into `name` at this boundary so every
// storefront surface (header, footer, title, OG, JSON-LD, hero) shows the SITE
// name with zero per-surface wiring and never leaks the tenant's legal name. The
// legacy `businessName`/`name` fields stay in the payload only as a last-resort
// fallback for a storefront talking to an older api-rest that predates
// `propertyName`.
interface TenantApiResponse {
  success: boolean;
  data?: Omit<ResolvedSite, 'billingPhase'> & {
    businessName?: string | null;
    propertyName?: string | null;
    billingPhase?: SiteBillingPhase;
  };
  error?: { code: string; message: string };
}

const DEFAULT_SITE: SiteCommerce = {
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
  showStockBelow: 10,
  hidePricesWhenSignedOut: false,
  requireAuthForCheckout: false,
  paymentMode: 'card',
};

// Consent defaults to 'off' (no banner, no consent cookie) so storefronts
// served by an older api-rest that doesn't yet return `consent` behave exactly
// as before.
const DEFAULT_CONSENT: SiteConsent = {
  mode: 'off',
  categories: ['strictly_necessary', 'preferences', 'analytics', 'marketing'],
  activeCategories: [],
  bannerEnabled: false,
  bannerTitle: null,
  bannerBody: null,
  policyPageSlug: 'cookie-policy',
  policyVersion: '1',
};

/** The site a request routes to: which TENANT and which of its web PROPERTIES
 *  (sites). `propertySlug` is null for the tenant's primary site (api-rest then
 *  defaults to it), so single-site tenants need no property at all. */
export interface SiteRoute {
  tenantSlug: string;
  propertySlug: string | null;
  /**
   * The zone this route was decoded from, when it came from a zone host.
   *
   * Null for a custom domain and for the dev override, because neither carries
   * a brand claim: a custom domain is matched EXACTLY against the domains table,
   * which is itself the proof of ownership.
   *
   * Present, it is a claim that has to be CHECKED — see `resolveSite`. A zone
   * host is self-describing about the tenant and says nothing true about the
   * brand, so on its own it would let either brand's zone serve either brand's
   * tenant.
   */
  zone: string | null;
}

/** Decode one of OUR `*.sparx.zone` subdomains into its tenant + property.
 *
 *  These hosts are SELF-DESCRIBING — api-rest's `mintZoneHost` encodes the tenant
 *  (and property) directly in the hostname — so we resolve them from the host
 *  alone, with no API round-trip. That makes zone hosts immune to a stale or
 *  unreachable `site-by-host` lookup (the domains table is just a mirror of this
 *  deterministic minting). Custom domains, whose mapping is arbitrary, return null
 *  here and fall through to the domains table.
 *
 *    `<tenant>.<zone>`            → primary site            (propertySlug null)
 *    `<property>.<tenant>.<zone>` → that tenant's named site
 *
 *  ...for EVERY zone this deployment owns — `sparx.zone` and `piggles.site`
 *  today. The zone is matched first and stripped, so the label decoding below is
 *  identical whichever brand the host belongs to.
 *
 *  A legacy flat `<tenant>-<property>` host is a single label here, so it decodes
 *  as a (usually non-existent) tenant slug and 404s — deprecated in favour of the
 *  dotted form (migration 20260707000000); the dotted host is now canonical. */
export function zoneSiteRoute(host: string | null | undefined): SiteRoute | null {
  if (!host) return null;
  const noPort = host.split(':')[0]?.toLowerCase();
  if (!noPort) return null;
  // Which of our zones is this host in? A host in none of them is a custom
  // domain and belongs to step 3, whose mapping is arbitrary and only the
  // domains table knows.
  const zone = OWNED_ZONES.find((z) => noPort === z || noPort.endsWith(`.${z}`));
  if (!zone || noPort === zone) return null;
  const labels = noPort.slice(0, -`.${zone}`.length).split('.');
  if (labels.length === 1 && labels[0]) {
    return { tenantSlug: labels[0], propertySlug: null, zone };
  }
  if (labels.length === 2 && labels[0] && labels[1]) {
    return { tenantSlug: labels[1], propertySlug: labels[0], zone };
  }
  // Three+ labels aren't a shape we mint.
  return null;
}

// Ask api-rest to map a CUSTOM-domain Host header → { tenantSlug, propertySlug }
// via the non-RLS domains table (docs/49 §5). Only reached for hosts that are NOT
// one of our own zone subdomains (those are decoded structurally by
// zoneSiteRoute, with no API round-trip) — a custom domain's mapping is arbitrary,
// so the domains table is its only source of truth. Null on miss/unreachable.
//
// `cache: 'no-store'`: host→site routing is correctness-critical and cheap (one
// indexed unique lookup), so read it live rather than risk the data cache serving
// a stale negative that would 404 a live custom domain.
async function fetchSiteByHost(host: string): Promise<SiteRoute | null> {
  try {
    const res = await fetch(`${BASE_URL}/v1/public/site-by-host?host=${encodeURIComponent(host)}`, {
      cache: 'no-store',
    });
    const json = (await res.json()) as
      { success: true; data: { tenantSlug: string; propertySlug: string } } | { success: false };
    if (!res.ok || !json.success) return null;
    return { tenantSlug: json.data.tenantSlug, propertySlug: json.data.propertySlug, zone: null };
  } catch {
    return null;
  }
}

// Hosts with no per-tenant DNS — the ONLY place the dev `?tenant=`/`?property=`
// override (relayed by the proxy as x-tenant-slug/x-property-slug) may steer site
// selection. Mirrors wizeworks/apps/site/proxy.ts `isLocalDevHost` (port-tolerant).
function isLocalDevHost(host: string): boolean {
  const h = host.split(':')[0]?.toLowerCase() ?? '';
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h.endsWith('.localhost')
  );
}

// Resolves the active site (tenant + property). The PUBLIC HOST is authoritative:
//   1. Our self-describing `*.sparx.zone` subdomains, decoded straight from the
//      host (no API round-trip, no override consulted).
//   2. The dev `?tenant=`/`?property=` override (via x-tenant-slug/x-property-slug)
//      — ONLY on a local-dev host, where there's no per-tenant DNS.
//   3. Arbitrary custom domains → the domains table.
//
// Ordering here is a CORRECTNESS invariant, not a mere preference. The dev override
// used to be consulted FIRST, before the host — so a single leaked/stale
// `sparx_dev_tenant` cookie (relayed to x-tenant-slug) pinned EVERY `*.sparx.zone`
// host in that browser to one site, and — because the cookie carries only the
// TENANT slug — to that tenant's PRIMARY site. That is the "all my sites load the
// same one" bug. The host now wins first, and the override is gated strictly to
// local-dev hosts, so a real host can never be re-pointed by an override header —
// even if a stale or misbehaving proxy in front of us relays one. This resolver is
// the backstop; the proxy (wizeworks/apps/site/proxy.ts) is the first line. Do not reorder.
export const resolveSiteRoute = cache(async (): Promise<SiteRoute | null> => {
  const hdrs = await headers();
  // The real public host can arrive on EITHER header: behind Caddy (GKE) the
  // original `Host` is preserved, while a proxy that rewrites Host (e.g. Cloud Run)
  // carries the public host on `x-forwarded-host`. Consider both — for OUR
  // self-describing `*.sparx.zone` subdomains only the real host parses to a valid
  // tenant/property structure, so trying both is unambiguous and immune to whichever
  // header the ingress populates.
  const candidates = [hdrs.get('x-forwarded-host'), hdrs.get('host')].filter(
    (h): h is string => !!h
  );
  const primaryHost = candidates[0] ?? null;

  // (1) Public host is authoritative. Our own subdomains are self-describing —
  // decode tenant + property straight from the host, with NO regard to any override
  // header. A stale/unreachable site-by-host can never 404 a live tenant site, and a
  // leaked override can never re-point a real host.
  for (const cand of candidates) {
    const zoneRoute = zoneSiteRoute(cand);
    if (zoneRoute) return zoneRoute;
  }

  // (2) Dev override — honored ONLY on a local-dev host (or when no host arrived at
  // all, e.g. an internal call). Never on a real `*.sparx.zone` host (handled above)
  // or a custom domain (handled below).
  if (!primaryHost || isLocalDevHost(primaryHost)) {
    const devTenant = hdrs.get('x-tenant-slug');
    if (devTenant) {
      return { tenantSlug: devTenant, propertySlug: hdrs.get('x-property-slug'), zone: null };
    }
    if (!primaryHost) return null;
  }

  // (3) Custom domain: the domains table is the only source of truth.
  return fetchSiteByHost(primaryHost);
});

/**
 * The route, but only once the tenant answering on it has been confirmed to
 * belong to the zone's brand.
 *
 * ── USE THIS, NOT `resolveSiteRoute`, TO FETCH TENANT-SCOPED DATA ───────────
 *
 * `resolveSiteRoute` decodes a zone host structurally, which is cheap and says
 * nothing about WHOSE brand the tenant is. The cross-brand check lives in
 * `resolveSite`, because only the fetched tenant knows its brand — so anything
 * that reads the raw route and goes straight to an API is outside that check.
 * That is not hypothetical: the scheduling reads did exactly this, so a Piggles
 * business's bookable services were reachable on a sparx-zone host even after
 * the page itself refused to render.
 *
 * Free to call: `resolveSite` is request-cached, and every page already
 * resolves it.
 */
export const verifiedSiteRoute = cache(async (): Promise<SiteRoute | null> => {
  const route = await resolveSiteRoute();
  if (!route) return null;
  return (await resolveSite()) ? route : null;
});

/** The active web property slug for this request (null = the tenant's primary
 *  site). Threaded into the per-property Builder reads as `?property=`. */
export async function resolveActivePropertySlug(): Promise<string | null> {
  return (await resolveSiteRoute())?.propertySlug ?? null;
}

// Cached per-request so layout + page can both resolve the site without a
// double fetch. React.cache() dedupes within a single server render.
export const resolveSite = cache(async (): Promise<ResolvedSite | null> => {
  const route = await resolveSiteRoute();
  if (!route) return null;
  const { tenantSlug: slug, propertySlug } = route;

  try {
    // `?property=` makes the payload reflect the active site's brand override
    // (docs/49 §3) — absent for the primary site, so its payload is unchanged.
    const propertyParam = propertySlug ? `?property=${encodeURIComponent(propertySlug)}` : '';
    const res = await fetch(
      `${BASE_URL}/v1/public/tenants/${encodeURIComponent(slug)}${propertyParam}`,
      {
        next: {
          revalidate: 300,
          tags: propertySlug
            ? [`tenant:${slug}`, `tenant:${slug}:${propertySlug}`]
            : [`tenant:${slug}`],
        },
      }
    );
    const json = (await res.json()) as TenantApiResponse;
    if (!res.ok || !json.success || !json.data) return null;

    // ── A ZONE HOST MUST BELONG TO THE BRAND THAT OWNS THAT ZONE ────────────
    //
    // The structural decode strips the zone and trusts the slug, which is right
    // about WHICH TENANT and says nothing about WHOSE ZONE. Left unchecked, every
    // tenant is reachable under every zone this deployment serves: a Piggles
    // business would answer on `<slug>.sparx.zone` and a sparx one on
    // `<slug>.piggles.site`. Two products that must be separately deletable
    // cannot serve each other's customers' websites on each other's domains.
    //
    // Checked HERE rather than in the decode because only the tenant knows its
    // brand, and the tenant arrives here. Costs nothing: this fetch already
    // happens, and `platformBrand` is already in the payload.
    //
    // Only for a ZONE route. A custom domain is matched exactly against the
    // domains table — that row IS the proof of ownership — and the dev override
    // is local-host only.
    const claimedZone = route.zone;
    if (claimedZone) {
      const brand = json.data.platformBrand ?? DEFAULT_PLATFORM_BRAND;
      const brandZone = platformBrandIdentity(brand).zoneDomain;
      // A brand with no zone configured cannot be checked, and refusing to serve
      // it would dark every one of its sites over a missing config value. The
      // mismatch is what is actionable; the absence is not.
      if (brandZone && brandZone !== claimedZone) return null;
    }

    const { businessName, propertyName, ...data } = json.data;
    // The customer-facing name is the SITE name (`propertyName`). Fall back to the
    // legacy brand/legal name ONLY for an older api-rest that doesn't return it.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- `||` is intended: an empty trimmed propertyName must fall through to businessName, which `??` would not do.
    const siteName = propertyName?.trim() || businessName?.trim();
    return {
      ...data,
      name: siteName && siteName.length > 0 ? siteName : data.name,
      // Merged over the defaults rather than substituted for them: an api-rest
      // that predates a field sends the block WITHOUT it, and `??` only catches
      // the block being missing entirely. `paymentMode` arriving as undefined
      // while the type says it cannot is how a storefront ends up branching on a
      // value nobody sent.
      commerce: {
        ...DEFAULT_SITE,
        ...(data.commerce ?? (data as { storefront?: SiteCommerce }).storefront ?? {}),
      },
      consent: data.consent ?? DEFAULT_CONSENT,
      // Defaults to [] so a storefront served by an older api-rest that doesn't
      // yet return `socials` behaves exactly as before (no links).
      socials: data.socials ?? [],
      // All-null on an older api-rest that doesn't return it, which is the same
      // thing as "the business has not filled these in" — the authored content
      // stands rather than being blanked.
      contact: data.contact ?? { phone: null, email: null, address: null },
      // Defaults null on an older api-rest that doesn't return it — the chrome
      // then renders whatever the node was authored with, rather than blanking.
      tagline: data.tagline ?? null,
      // Defaults true so a storefront on an older api-rest (which sent this under
      // its former, brand-named key) keeps showing the credit — always-on by default.
      // Defaults to [] on an older api-rest that omits it — a shop with no known
      // other languages reads exactly as it always did.
      languages: Array.isArray(data.languages) ? data.languages : [],
      showPlatformCredit: data.showPlatformCredit ?? true,
      platformBrand: data.platformBrand ?? DEFAULT_PLATFORM_BRAND,
      // Defaults 'active' on an older api-rest that omits it — a site is NEVER
      // suspended on missing data (only an explicit 'suspended' darkens it).
      billingPhase: data.billingPhase ?? 'active',
    };
  } catch {
    return null;
  }
});
