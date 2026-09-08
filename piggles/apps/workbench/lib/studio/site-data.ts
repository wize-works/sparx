'use client';

// What the studio reads about the SITE — the facts underneath every builder pane.
//
// The brand, the site's config, its binding catalog, its sample records, its
// address, and the shape of the pre-publish check. Documents are not here: a page,
// the chrome, a look, a piece and an email each have their own module beside this
// one, because each is loaded and saved on its own.
//
// These came out of the old editor's `data.ts`, which held both these reads AND the
// whole-site load/save/publish the retired `<Builder>` ran on. Only the reads are
// here — the whole-site writes went with the editor, and the per-document ones that
// replaced them live with their documents.

import { useQuery } from '@wizeworks/query';
import type { BindingCatalog, SilicaPieceDto } from '@wizeworks/builder-schemas';
import { api } from '../api/client';
import { getTokenState } from '../api/token';
import type { BrandColumns } from './brand-theme';
import type { SitePreviewData } from './preview-data';
import { SILICA_PIECES_KEY } from './piece-keys';

export type { BindingCatalog };

export const CATALOG_KEY = ['builder', 'binding-catalog'];
export const RECORD_SAMPLES_KEY = ['builder', 'record-samples'];
// Re-exported, not re-declared. It was written out here a second time with the
// same literal, which worked only by coincidence and was one of the three keys
// nothing invalidated across — see piece-keys.ts.
export { SILICA_PIECES_KEY };

/** A connected domain, enough to build a preview address from. */
interface DomainRow {
  propertyId: string;
  host: string;
  type: string;
  status: string;
  isCanonical: boolean;
}

/**
 * The local storefront, for development only.
 *
 * A tenant's canonical domain is REAL DNS pointing at production, so in local dev
 * Preview opened the LIVE site and handed it a preview token minted by the LOCAL
 * api-rest: the draft was never shown, and a local credential left the machine on
 * every click. Set `NEXT_PUBLIC_STOREFRONT_ORIGIN` and Preview stays here. Unset —
 * every deployed environment — this branch is dead and behaviour is unchanged.
 */
const DEV_STOREFRONT_ORIGIN = (process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN ?? '').replace(/\/+$/, '');

/** The active web property, WITH its per-site brand override (docs/49) — which
 *  decides whether the canvas opens on the tenant base brand (primary site) or this
 *  site's overridden look. */
export interface ActiveProperty {
  id: string;
  /** What this site is CALLED. Already in the payload — declared here so the canvas
   *  can name the business the moment the shell knows it, rather than waiting on the
   *  fuller chrome read and painting a sample headline in the meantime. */
  name: string;
  slug: string;
  isPrimary: boolean;
  brandOverride: unknown;
  /** How customers reach this business. Already in the payload — declared here so the
   *  email preview can address merge tags at the real business rather than a sample. */
  settings?: { contact?: { email?: string | null } | null } | null;
}

/** The tenant brand — identity colors, fonts, logos (docs/30 §6). Ungated
 *  (`/v1/brand` is platform-level like `/v1/tenant`). */
export interface BrandDto extends BrandColumns {
  businessName: string | null;
}

/** A neutral brand so a failed read degrades to a bare, working editor rather than
 *  throwing — the compiled theme then falls through to a preset. */
export const FALLBACK_BRAND: BrandDto = {
  businessName: null,
  tagline: null,
  logoLightMediaId: null,
  logoDarkMediaId: null,
  faviconMediaId: null,
  colorPrimary: null,
  colorPrimaryForeground: null,
  colorSecondary: null,
  colorSecondaryForeground: null,
  colorAccent: null,
  colorAccentForeground: null,
  fontHeading: null,
  fontBody: null,
  tokens: null,
};

export const PRODUCT_TYPE_CHOICES_KEY = ['builder', 'product-type-choices'];

interface ProductTypeChoiceWire {
  key: string;
  name: string;
}

/** The draft site config — which theme the site is on, the theme's own preset, and
 *  the v2 presentation overlay the theme inspector edits.
 *
 *  `themePreset` is the theme itself (`{v, v1, v2}`); `themeKey` only NAMES it.
 *  Reading the key alone is what left the canvas painting the platform base under
 *  every site's brand — see brand-theme.ts. */
export interface SiteConfigDto {
  themeKey: string;
  draftSettings: { presentation?: unknown; themePreset?: unknown };
}

export const FALLBACK_CONFIG: SiteConfigDto = { themeKey: 'default', draftSettings: {} };

/** The public tenant chrome payload the storefront resolves its header/footer from. */
interface PublicTenantChrome {
  name: string;
  businessName: string | null;
  propertyName: string | null;
  tagline?: string | null;
  theme: { logoMediaId: string | null; logoDarkMediaId?: string | null } | null;
  socials?: { platform: string; url: string }[];
  /** How customers reach this site — already returned by the endpoint, and for a
   *  while read by nobody here, which is why a Contact page kept previewing the
   *  blueprint's invented phone number. */
  contact?: { phone: string | null; email: string | null; address: string | null } | null;
}

/** A phone number as something a phone can dial. Mirrors the live site's
 *  `telHref` — a `tel:` with brackets and spaces in it does not dial. */
function telHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return /\d/.test(digits) ? `tel:${digits}` : null;
}

/** Trimmed, or null. '' is a KNOWN-but-empty value that the resolver fills OVER
 *  the authored words, which would blank the node instead of leaving the
 *  placeholder the owner still needs to see. */
function orNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

/** A media id → the public media redirect URL (the browser <img> loads it), or an
 *  absolute ref passed through. Null for an empty id. Uses the public API origin
 *  the token route resolves. */
function publicMediaUrl(apiUrl: string, assetId: string | null, tenantSlug: string): string | null {
  if (!assetId) return null;
  if (/^(?:https?:|data:)/i.test(assetId)) return assetId;
  return `${apiUrl}/v1/public/media/${encodeURIComponent(assetId)}?tenant=${encodeURIComponent(tenantSlug)}`;
}

export function useActiveProperty(propertyId: string | null) {
  return useQuery({
    queryKey: ['builder', 'active-property', propertyId],
    queryFn: async () => {
      const rows = await api.get<ActiveProperty[]>('/v1/properties');
      return rows.find((p) => p.id === propertyId) ?? rows.find((p) => p.isPrimary) ?? null;
    },
    enabled: Boolean(propertyId),
    staleTime: 300_000,
  });
}

/** What a page can bind to — the tenant's real CMS content types plus the
 *  code-defined commerce/CRM sources. Drives the binding picker + canvas preview
 *  data. Degrades to an empty catalog (the editor still runs on the code sources). */
export function useBindingCatalog() {
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () =>
      api.get<BindingCatalog>('/v1/builder/binding-schema').catch<BindingCatalog>(() => ({
        sources: [],
      })),
    staleTime: 300_000,
  });
}

export function useBrand() {
  return useQuery({
    queryKey: ['builder', 'brand'],
    queryFn: () => api.get<BrandDto>('/v1/brand').catch(() => FALLBACK_BRAND),
    staleTime: 300_000,
  });
}

/** The tenant's product types, for the per-type page target (docs/143 §6.10). Degrades to
 *  an EMPTY list on any failure — commerce may be switched off, in which case a product
 *  page simply offers "All products" and nothing else, rather than erroring a panel that
 *  is not the point of the screen. */
export function useProductTypeChoices(enabled: boolean) {
  return useQuery({
    queryKey: PRODUCT_TYPE_CHOICES_KEY,
    queryFn: () =>
      api
        .list<ProductTypeChoiceWire>('/v1/commerce/product-types', { take: 250 })
        .then((r) => r.items.map((t): ProductTypeChoice => ({ key: t.key, name: t.name })))
        .catch<ProductTypeChoice[]>(() => []),
    enabled,
    staleTime: 300_000,
  });
}

/**
 * A real storefront path per record detail page — `{'commerce.product':
 * '/products/brake-kit'}` — so Preview on a product template opens an actual product
 * rather than the product list.
 *
 * Degrades to `{}` on failure and omits any record type the tenant has no visible record
 * of; `previewPath` then falls back to the route index, which is where Preview went
 * before this existed. So the worst case is the old behaviour, never a 404.
 *
 * `staleTime` is generous because the answer only changes when the catalog gains its
 * FIRST record of a kind — publishing a second product does not move it.
 */
export function useRecordSamplePaths() {
  return useQuery({
    queryKey: RECORD_SAMPLES_KEY,
    queryFn: () =>
      api
        .get<{ paths: Record<string, string> }>('/v1/builder/site/record-samples')
        .then((r) => r.paths)
        .catch<Record<string, string>>(() => ({})),
    staleTime: 300_000,
  });
}

/**
 * The tenant's PLACEABLE saved pieces — the ones with a silica master. Merged into
 * the document's symbol map before `<Builder>` mounts (`withTenantPieces`), which is
 * why this has to settle alongside the site read rather than stream in later: a
 * symbol map arriving after mount would not reach the engine, which reads `document`
 * once.
 *
 * Degrades to an EMPTY list on failure, deliberately. A failed piece read means the
 * author's library is missing from the Components board for this session — annoying,
 * and recoverable by reloading. Holding the whole editor shut over it would turn a
 * secondary feature's outage into "you cannot edit your website", which is a far
 * worse trade for the same cause.
 *
 * The endpoint is TENANT-scoped (docs/53) — no `?property=`. That is the entire
 * point: the same library reaches every site the business owns.
 */
export function useSilicaPieces() {
  return useQuery({
    queryKey: SILICA_PIECES_KEY,
    queryFn: () =>
      api
        .get<{ components: SilicaPieceDto[] }>('/v1/builder/components?include=silica')
        .then((r) => r.components)
        .catch<SilicaPieceDto[]>(() => []),
  });
}

export function useSiteConfig() {
  return useQuery({
    queryKey: ['builder', 'site-config'],
    queryFn: () => api.get<SiteConfigDto>('/v1/sitebuilder/config').catch(() => FALLBACK_CONFIG),
    staleTime: 300_000,
  });
}

/** The site's public origin for THIS property — its canonical address, preferring a
 *  live one. Null when the site has no reachable host yet. */
export function useSiteOrigin(propertyId: string | null) {
  return useQuery<SitePreviewTarget | null>({
    queryKey: ['builder', 'site-origin', propertyId, DEV_STOREFRONT_ORIGIN],
    queryFn: async () => {
      // Local dev has no per-tenant DNS, so the storefront identifies the site from
      // `?tenant=`/`?property=` (its proxy stashes them as headers + cookies). Without
      // them a fresh preview tab resolves nothing and renders "Store not found".
      if (DEV_STOREFRONT_ORIGIN) {
        const [tenant, properties] = await Promise.all([
          api.get<{ slug: string }>('/v1/tenant'),
          api.get<{ id: string; slug: string }[]>('/v1/properties'),
        ]);
        const params = new URLSearchParams({ tenant: tenant.slug });
        const property = properties.find((p) => p.id === propertyId);
        if (property) params.set('property', property.slug);
        return { origin: DEV_STOREFRONT_ORIGIN, extraQuery: `&${params.toString()}` };
      }
      const domains = await api.get<DomainRow[]>('/v1/domains');
      const mine = domains.filter((d) => d.propertyId === propertyId);
      const live = mine.find(
        (d) => d.isCanonical && (d.status === 'active' || d.type === 'subdomain')
      );
      const chosen = live ?? mine.find((d) => d.isCanonical) ?? mine[0] ?? null;
      return chosen ? { origin: `https://${chosen.host}`, extraQuery: '' } : null;
    },
    enabled: Boolean(propertyId),
    staleTime: 300_000,
  });
}

/** The tenant's REAL site-chrome data — resolved exactly like the storefront's
 *  `site.*` roots so the canvas header/footer match the live site: the display name
 *  + tagline + public logo URLs, and the social links. Overlaid onto the canvas
 *  preview data so a bound Wordmark/logo/name/socials resolve to real values.
 *
 *  Degrades to a bare "Brand" with no social on any failure, so the canvas still
 *  renders. `propertySlug` scopes it to the active site (a per-site brand override
 *  previews correctly). */
export function useSitePreview(tenantSlug: string | null, propertySlug: string | null) {
  return useQuery({
    queryKey: ['builder', 'site-preview', tenantSlug, propertySlug],
    queryFn: async (): Promise<SitePreviewData> => {
      try {
        const { apiUrl } = await getTokenState();
        const propertyParam = propertySlug ? `?property=${encodeURIComponent(propertySlug)}` : '';
        const payload = await api.get<PublicTenantChrome>(
          `/v1/public/tenants/${encodeURIComponent(tenantSlug ?? '')}${propertyParam}`
        );
        // The customer-facing SITE name wins (docs/49): the active site's name, then
        // the legacy business name, then the tenant name. First non-empty value.
        const name =
          [payload.propertyName, payload.businessName].map((s) => s?.trim()).find((s) => s) ??
          payload.name;
        // `/v1/public/media/:id?tenant=` resolves the asset by tenant SLUG (not the
        // display name) — passing payload.name silently 404s the logo while the name
        // still renders, which read as "logo missing".
        const logoUrl = publicMediaUrl(
          apiUrl,
          payload.theme?.logoMediaId ?? null,
          tenantSlug ?? ''
        );
        const logoDarkUrl = publicMediaUrl(
          apiUrl,
          payload.theme?.logoDarkMediaId ?? null,
          tenantSlug ?? ''
        );
        const social = (payload.socials ?? []).filter(
          (s) =>
            typeof s?.platform === 'string' && typeof s?.url === 'string' && s.url.trim() !== ''
        );
        const email = orNull(payload.contact?.email);
        return {
          identity: {
            name,
            tagline: payload.tagline?.trim() ? payload.tagline : null,
            logo: logoUrl ? { url: logoUrl, alt: name } : null,
            logoDark: logoDarkUrl ? { url: logoDarkUrl, alt: name } : null,
            phone: orNull(payload.contact?.phone),
            email,
            address: orNull(payload.contact?.address),
            phoneHref: telHref(orNull(payload.contact?.phone)),
            emailHref: email ? `mailto:${email}` : null,
          },
          social,
        };
      } catch {
        return {
          identity: {
            name: 'Brand',
            tagline: null,
            logo: null,
            logoDark: null,
            phone: null,
            email: null,
            address: null,
            phoneHref: null,
            emailHref: null,
          },
          social: [],
        };
      }
    },
    enabled: Boolean(tenantSlug),
    staleTime: 300_000,
  });
}

export interface CheckFinding {
  rule: string;
  severity: CheckSeverity;
  title: string;
  detail: string;
  evidence?: string;
  /** A correction the editor may apply for the author — present only when the server
   *  judged it BOTH unambiguous and safe to apply here (`@wizeworks/site-lint`'s `LintFix`).
   *  Most findings never carry one: "choose a destination for this link" and "pick a
   *  readable color" are the author's decisions, not ours. */
  fix?: CheckFix;
  location: CheckLocation;
}

/** How much a finding matters. NEVER whether a publish may proceed — the server
 *  route says the same thing, and the publish endpoint does not consult it. */
export type CheckSeverity = 'error' | 'warning' | 'suggestion';

/** Which authored tree a finding lives in — the tree the fix happens in, which is
 *  not always the page it was seen on. */
export type CheckScope = 'page' | 'frame' | 'symbol' | 'site';

/** Where a finding is, precisely enough to open the right thing and select the right
 *  block. `ownerId` is a page id for `page`, a symbol id for `symbol`, null otherwise. */
export interface CheckLocation {
  scope: CheckScope;
  ownerId: string | null;
  ownerName: string;
  nodeId: string | null;
  nodePath: string;
  seenOn: string[];
}

/** Swap one class token for another on the node the finding names. The only fix kind. */
export interface CheckFix {
  kind: 'replace-class';
  from: string;
  to: string;
  label: string;
}

export interface CheckBudget {
  /** Heaviest first. */
  pages: CheckPageWeight[];
  heavyImages: CheckHeavyImage[];
  /** Distinct class NAMES that emit no CSS. The findings above count BLOCKS, so a
   *  smaller number here is one typo repeated, not a disagreement. */
  unbackedClasses: string[];
  heaviestPageBytes: number;
  unsizedImages: number;
}

export interface CheckPageWeight {
  pageId: string;
  pageName: string;
  slug: string;
  /** Bytes of the page's own markup; null if it could not be rendered. */
  htmlBytes: number | null;
  imageCount: number;
  imageBytes: number;
  /** Pictures whose weight is NOT in `imageBytes` — hosted elsewhere, or filled in
   *  from a record. Real weight that is missing from the total, which is why the
   *  panel has to say so rather than showing a tidier number. */
  imagesUnsized: number;
  /** `htmlBytes + imageBytes`. A FLOOR on what a first visit costs: styling, fonts,
   *  scripts and embeds are on top of it. */
  totalBytes: number;
  band: CheckWeightBand;
}

export interface CheckHeavyImage {
  src: string;
  bytes: number;
  pageCount: number;
}

/** How a page reads at a glance. Three bands, not a score — and NOT a severity:
 *  weight is a trade, so nothing here counts as a finding or changes `status`. */
export type CheckWeightBand = 'light' | 'heavy' | 'very-heavy';

export interface SiteCheckReport {
  status: 'pass' | 'warn' | 'fail';
  findings: CheckFinding[];
  counts: Record<CheckSeverity, number>;
  pagesChecked: number;
  /** Pages the check could not open — no draft has ever been saved for them. Named,
   *  because "nothing to fix" over a site with unopened pages is not a clean result. */
  notChecked?: { id: string; name: string }[];
  budget: CheckBudget;
}

/** Where Preview should open this site, and anything the target needs in the query
 *  string to know WHICH site it is. `extraQuery` is empty everywhere but local dev. */
export interface SitePreviewTarget {
  origin: string;
  extraQuery: string;
}

/** One product type a `commerce.product` page can target, stripped to what the target
 *  picker shows. The commerce mirror of a CMS content type (docs/143). */
export interface ProductTypeChoice {
  key: string;
  name: string;
}
