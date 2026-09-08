// Public read endpoints for headless storefronts and the marketing site.
//
//   GET /v1/public/content/entries          ?tenant=<slug>&type=<key>[&limit=&cursor=|&page=]
//   GET /v1/public/content/entries/by-slug  ?tenant=<slug>&type=<key>&slug=<>
//   GET /v1/public/content/types/:key       ?tenant=<slug>
//
// No auth required: results are restricted to `status='published'` and
// `deleted_at IS NULL`. Tenant resolution is by SLUG (tenants table is the
// only non-RLS row, safe to look up), then RLS-scoped reads with that
// tenant's id via `withTenant`.
//
// Preview tokens (Phase 2.6) layer on top: when the request carries
// `Authorization: Preview <jwt>` and the jwt validates + names the same
// entry being requested, the draft is served instead. That's wired in
// wizeworks/services/api-rest/src/lib/preview.ts (see also the dashboard's "Copy
// preview URL" button on each entry).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, withTenant } from '@wizeworks/db';
import { checkoutService, commerceSiteService } from '@wizeworks/commerce';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { notFound, badRequest } from '@wizeworks/api-core/errors';
import { serializeEntry, PUBLIC_ENTRY_BYLINE_INCLUDE } from '@wizeworks/cms';
import { tryVerifyPreviewToken } from '../../../lib/preview.js';
import { readPublicConsentConfig } from '../../../lib/consent.js';
import { parseBrandOverride, mergeBrandIdentity } from '../../../lib/property-brand.js';
import { resolvePublicPropertyId, contentSiteVisibilityWhere } from '../../../lib/property.js';
import { requireTenantIdBySlug } from '../../../lib/tenant-slug.js';
import { resolveBillingPhase, isPlatformTenant } from '@wizeworks/billing';

// `property` (a stable site slug) scopes content to one web PROPERTY (docs/49
// Model B). The storefront passes it for non-primary sites; omitted → primary.
// `page` is ADDITIVE to the cursor, not a replacement, and both are kept on purpose.
//
// A cursor is the right walk for a feed that grows while you read it — it cannot skip
// or repeat a row — and it is what every existing caller uses. But a storefront blog
// index needs "page 4 of 9" in a URL a reader can bookmark and a search engine can
// crawl, and a cursor cannot express that: there is no fourth cursor to put in a link
// until you have walked the first three. So a request that names a page gets offset
// paging plus a real total; everything else behaves exactly as before, down to the
// `next_cursor` in the envelope.
const ListQuery = z.object({
  tenant: z.string().min(1).max(63),
  property: z.string().min(1).max(63).optional(),
  type: z.string().min(1).max(63),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});

const BySlugQuery = z.object({
  tenant: z.string().min(1).max(63),
  property: z.string().min(1).max(63).optional(),
  type: z.string().min(1).max(63),
  slug: z.string().min(1).max(255),
});

// Batch entry read by id (docs/127 §7). The storefront resolves the CMS entries a
// builder tree PINS, and did it with one HTTP round-trip per pin — the commerce
// loader beside it already batched via an `ids:` parameter, so a page pinning six
// blog posts made six requests where a page pinning six products made one.
//
// Capped at 50: pins come from an authored tree, so a realistic page has a handful.
// The cap bounds the `IN (...)` rather than expressing an expected size.
const ByIdsQuery = z.object({
  tenant: z.string().min(1).max(63),
  property: z.string().min(1).max(63).optional(),
  ids: z
    .string()
    .min(1)
    .transform((raw) => raw.split(',').filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
});

const TypeKeyParams = z.object({ key: z.string().min(1).max(63) });
const TypeKeyQuery = z.object({ tenant: z.string().min(1).max(63) });

const ByIdParams = z.object({ id: z.string().uuid() });
const ByIdQuery = z.object({
  tenant: z.string().min(1).max(63),
  property: z.string().min(1).max(63).optional(),
});

// A clean { platform, url }[] from an unknown JSON value, dropping malformed
// entries. Used to read both per-site (Property.settings.socials) and tenant
// (Tenant.socials) links into the same shape.
function coerceSocials(raw: unknown): { platform: string; url: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { platform, url } = item as Record<string, unknown>;
    const p = typeof platform === 'string' ? platform.trim() : '';
    const u = typeof url === 'string' ? url.trim() : '';
    return p && u ? [{ platform: p, url: u }] : [];
  });
}

/** How a customer reaches this business, bindable as `site.identity.phone` /
 *  `.email` / `.address`. Per-site only — there is no tenant-level fallback,
 *  because a shared phone number across two unrelated businesses is the defect,
 *  not the convenience. */
export interface SiteContact {
  phone: string | null;
  email: string | null;
  address: string | null;
}

/** Read `Property.settings.contact` into a clean shape. Trims, and maps a blank
 *  to NULL rather than '' — an empty string is a KNOWN-but-empty value, which the
 *  silica resolver fills OVER the authored content and blanks the node. Null reads
 *  as unset and leaves the starter's own wording standing. */
function readSiteContact(settings: unknown): SiteContact {
  const empty: SiteContact = { phone: null, email: null, address: null };
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return empty;
  const raw = (settings as { contact?: unknown }).contact;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const field = (key: keyof SiteContact): string | null => {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  return { phone: field('phone'), email: field('email'), address: field('address') };
}

// The active site's social links: its OWN (Property.settings.socials) when set,
// else the tenant-level links (legacy / not-yet-personalised). Per-site is the
// authoritative model (docs/49 "full per-site brand"); the tenant fallback keeps
// existing single-site links rendering until each site sets its own.
function readSiteSocials(
  settings: unknown,
  tenantSocials: unknown
): { platform: string; url: string }[] {
  const own =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? coerceSocials((settings as { socials?: unknown }).socials)
      : [];
  return own.length > 0 ? own : coerceSocials(tenantSocials);
}

// Cached in lib/tenant-slug.ts (docs/127 §5) — seven handlers in this file alone
// resolved the same slug uncached, once per request.
const resolveTenantBySlug = requireTenantIdBySlug;

// "privacy-policy" → "Privacy Policy". Used as the footer link label only when
// a placement has no explicit label override (the seed always sets one).
function prettifySlug(slug: string): string {
  return slug
    .split(/[-_/]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Navigation item resolution — shared by the by-id and by-location reads. An
// item resolves to an href (an internal published CMS page, or an external URL);
// items with no resolvable href are dropped — and their descendants with them,
// so the storefront never renders a dead link. Tree-shaped via parentItemId.
interface RawNavItem {
  id: string;
  parentItemId: string | null;
  position: number;
  label: string;
  externalUrl: string | null;
  openInNewTab: boolean;
  entry: { slug: string | null; status: string; deletedAt: Date | null } | null;
}
interface PublicNavNode {
  id: string;
  label: string;
  href: string;
  openInNewTab: boolean;
  children: PublicNavNode[];
}

function buildNavTree(items: RawNavItem[]): PublicNavNode[] {
  const hrefFor = (item: RawNavItem): string | null => {
    if (item.externalUrl) return item.externalUrl;
    const e = item.entry;
    if (e?.slug && e.status === 'published' && !e.deletedAt) return `/${e.slug}`;
    return null;
  };
  const byParent = new Map<string | null, RawNavItem[]>();
  for (const item of items) {
    const key = item.parentItemId;
    const bucket = byParent.get(key) ?? [];
    bucket.push(item);
    byParent.set(key, bucket);
  }
  const build = (parentId: string | null): PublicNavNode[] =>
    (byParent.get(parentId) ?? []).flatMap((item) => {
      const href = hrefFor(item);
      if (!href) return [];
      return [
        {
          id: item.id,
          label: item.label,
          href,
          openInNewTab: item.openInNewTab,
          children: build(item.id),
        },
      ];
    });
  return build(null);
}

const NAV_ITEM_SELECT = {
  orderBy: { position: 'asc' },
  select: {
    id: true,
    parentItemId: true,
    position: true,
    label: true,
    externalUrl: true,
    openInNewTab: true,
    // Only published, non-deleted target pages resolve to a link.
    entry: { select: { slug: true, status: true, deletedAt: true } },
  },
} as const;

const publicContentRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/public/content/entries', async (request) => {
    const q = ListQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    // Model B: only entries published to the active site (global or scoped here).
    const where = {
      typeKey: q.type,
      status: 'published',
      deletedAt: null,
      ...contentSiteVisibilityWhere(propertyId),
    };
    const orderBy = [{ publishedAt: 'desc' as const }, { id: 'desc' as const }];

    // The numbered walk. The COUNT is what makes "page 4 of 9" sayable at all, and
    // it is only paid for by a caller that asked for a page — the cursor path below
    // is untouched, so nothing that exists today got slower.
    if (q.page !== undefined) {
      const [rows, total] = await withTenant({ tenantId }, (tx) =>
        Promise.all([
          tx.contentEntry.findMany({
            where,
            orderBy,
            take: q.limit,
            skip: (q.page! - 1) * q.limit,
            include: PUBLIC_ENTRY_BYLINE_INCLUDE,
          }),
          tx.contentEntry.count({ where }),
        ])
      );
      return paged(rows.map(serializeEntry), {
        page: q.page,
        per_page: q.limit,
        total,
        total_pages: Math.max(1, Math.ceil(total / q.limit)),
        // A page past the end is an empty page, not a 404: a reader who bookmarked
        // page 9 of a blog that shrank should see "nothing here" with working links
        // back, not an error page.
        next_cursor: null,
      });
    }

    const rows = await withTenant({ tenantId }, (tx) =>
      tx.contentEntry.findMany({
        where,
        orderBy,
        take: q.limit + 1,
        include: PUBLIC_ENTRY_BYLINE_INCLUDE,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      })
    );
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const next = hasMore ? (page[page.length - 1]?.id ?? null) : null;
    return paged(page.map(serializeEntry), { per_page: q.limit, next_cursor: next });
  });

  app.get('/v1/public/content/entries/by-slug', async (request) => {
    const q = BySlugQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const preview = await tryVerifyPreviewToken(app, request);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.contentEntry.findFirst({
        where: {
          typeKey: q.type,
          slug: q.slug,
          deletedAt: null,
          // Model B: an entry not on the active site 404s by URL too.
          ...contentSiteVisibilityWhere(propertyId),
          // Preview token grants draft access only for the entry it's
          // scoped to. For any other entry the default published-only
          // filter applies.
          ...(preview
            ? { OR: [{ status: 'published' }, { id: preview.entryId }] }
            : { status: 'published' }),
        },
        include: PUBLIC_ENTRY_BYLINE_INCLUDE,
      })
    );
    if (!row) throw notFound(`${q.type}`, q.slug);
    return ok(serializeEntry(row));
  });

  // Batch lookup by id (docs/127 §7) — the storefront hydrates every CMS entry a
  // builder tree pins in ONE request instead of one per pin.
  //
  // Registered BEFORE `/entries/:id` because Fastify would otherwise match "by-ids"
  // as an `:id` param and fail its uuid parse.
  //
  // Published-only, deliberately: this serves the storefront render path, and unlike
  // the single-id route there is no preview token scoped to a SET of entries. A
  // previewed page still resolves its pins as published, which is the same behaviour
  // the per-pin path had.
  app.get('/v1/public/content/entries/by-ids', async (request) => {
    const q = ByIdsQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.contentEntry.findMany({
        where: {
          id: { in: q.ids },
          status: 'published',
          deletedAt: null,
          ...contentSiteVisibilityWhere(propertyId),
        },
        include: PUBLIC_ENTRY_BYLINE_INCLUDE,
      })
    );
    // Unresolvable ids are simply absent — a pin to a deleted or unpublished entry
    // renders nothing, matching the per-pin path's null return.
    return ok(rows.map(serializeEntry));
  });

  // Public lookup by id — used for `reference` field resolution where a
  // referenced entry has slug=null and can't be fetched via /by-slug. Honors
  // preview tokens the same way.
  app.get('/v1/public/content/entries/:id', async (request) => {
    const { id } = ByIdParams.parse(request.params);
    const q = ByIdQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const preview = await tryVerifyPreviewToken(app, request);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.contentEntry.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(preview?.entryId === id ? {} : { status: 'published' }),
        },
      })
    );
    if (!row) throw notFound('Entry', id);
    return ok(serializeEntry(row));
  });

  // Public navigation menu read — the storefront layout resolves a header/footer
  // SiteLayoutBlock's `navigationMenuId` into renderable links. Items are
  // resolved to an href: an internal CMS page (entryId → published page slug)
  // or an external URL. Unpublished / missing entries are dropped so the
  // storefront never renders a dead link. Tree-shaped via parentItemId.
  app.get('/v1/public/content/navigation/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const q = z.object({ tenant: z.string().min(1).max(63) }).parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);

    const menu = await withTenant({ tenantId }, (tx) =>
      tx.navigationMenu.findUnique({
        where: { id },
        select: { id: true, location: true, name: true, items: NAV_ITEM_SELECT },
      })
    );
    if (!menu) throw notFound('Navigation menu', id);
    return ok({
      id: menu.id,
      location: menu.location,
      name: menu.name,
      items: buildNavTree(menu.items),
    });
  });

  // Public navigation menu read BY LOCATION — the Builder site layout (docs/45)
  // binds its chrome nav to `site.primaryNav` (location 'header') /
  // `site.footerNav` (location 'footer'); the storefront resolves those here
  // without needing a menu id. Resolution order (docs/49): site-specific menu
  // first, then the tenant-wide fallback (property_id IS NULL). 404 when neither
  // exists (the chrome nav then renders empty).
  app.get('/v1/public/content/navigation/by-location/:location', async (request) => {
    const { location } = z.object({ location: z.string().min(1).max(63) }).parse(request.params);
    const q = z
      .object({ tenant: z.string().min(1).max(63), property: z.string().min(1).max(63).optional() })
      .parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);

    const menu = await withTenant({ tenantId }, async (tx) => {
      // 1. Try the site-specific menu for the active property.
      const siteMenu = await tx.navigationMenu.findFirst({
        where: { tenantId, propertyId, location },
        select: { id: true, location: true, name: true, items: NAV_ITEM_SELECT },
      });
      if (siteMenu) return siteMenu;
      // 2. Fall back to the tenant-wide menu (property_id IS NULL).
      return tx.navigationMenu.findFirst({
        where: { tenantId, propertyId: null, location },
        select: { id: true, location: true, name: true, items: NAV_ITEM_SELECT },
      });
    });
    if (!menu) throw notFound('Navigation menu', location);
    return ok({
      id: menu.id,
      location: menu.location,
      name: menu.name,
      items: buildNavTree(menu.items),
    });
  });

  // Public legal-document placements — the storefront resolves a tenant's
  // legal pages (privacy/terms/cookie-policy/…) into footer/checkout/terms-gate
  // links (docs/42 §5). Like nav resolution, a placement whose entry is
  // unpublished / deleted / slugless is dropped so the storefront never renders
  // a dead link. `source_kind='integration_doc'` placements (no entry) are
  // skipped here until the integration-docs bridge lands.
  app.get('/v1/public/legal/placements', async (request) => {
    const q = z
      .object({
        tenant: z.string().min(1).max(63),
        placement: z.enum(['footer', 'checkout', 'terms_gate']).default('footer'),
        // The active site (docs/49 Phase 6c) — the footer returns this site's
        // placements PLUS the tenant-wide (null-property) ones. Absent → primary.
        property: z.string().min(1).max(63).optional(),
      })
      .parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property ?? null);

    const rows = await withTenant({ tenantId }, (tx) =>
      tx.siteDocPlacement.findMany({
        // Tenant-wide (null) placements show on every site; site-scoped ones only
        // on their site. A sibling site's exclusive links never appear here.
        where: {
          placement: q.placement,
          enabled: true,
          OR: [{ propertyId: null }, { propertyId }],
        },
        orderBy: { position: 'asc' },
        select: {
          id: true,
          label: true,
          legalKind: true,
          columnKey: true,
          entry: { select: { slug: true, status: true, deletedAt: true } },
        },
      })
    );

    const links = rows.flatMap((r) => {
      const e = r.entry;
      if (!e?.slug || e.status !== 'published' || e.deletedAt) return [];
      return [
        {
          label: r.label ?? prettifySlug(e.slug),
          href: `/${e.slug}`,
          legalKind: r.legalKind,
          columnKey: r.columnKey ?? 'legal',
        },
      ];
    });

    return ok(links);
  });

  app.get('/v1/public/content/types/:key', async (request) => {
    const { key } = TypeKeyParams.parse(request.params);
    const q = TypeKeyQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.contentType.findFirst({
        where: { key },
        orderBy: [{ isBuiltIn: 'asc' }, { updatedAt: 'desc' }],
      })
    );
    if (!row) throw notFound('Content type', key);
    return ok(row);
  });

  // Trivial readiness probe for downstream caches (Cloudflare etc.) — checks
  // the tenant exists. Cheap and CDN-friendly.
  app.get('/v1/public/tenants/:slug', async (request) => {
    const params = z.object({ slug: z.string().min(1).max(63) }).parse(request.params);
    // `?property=<slug>` selects which of the tenant's web PROPERTIES (sites) the
    // payload reflects (docs/49). Its optional brand override (Phase 4) merges
    // over the tenant brand below; absent → the tenant's brand as-is.
    const query = z.object({ property: z.string().min(1).max(63).optional() }).parse(request.query);
    const tenant = await prisma.tenant.findUnique({
      where: { slug: params.slug },
      select: {
        id: true,
        slug: true,
        name: true,
        settings: true,
        socials: true,
        // Billing lifecycle columns — the storefront reads the resolved `billingPhase`
        // (below) to serve the suspend overlay when a lapsed tenant's site goes dark
        // (docs/17 §6). Cheap columns already on the row we're fetching.
        subscriptionStatus: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        // Which PRODUCT this tenant signed up through. The public site renders
        // the platform attribution badge, and this one renderer serves both
        // brands — without this every Piggles business's footer credited sparx.
        platformBrand: true,
      },
    });
    if (!tenant) throw notFound('Tenant', params.slug);
    if (tenant.id === '00000000-0000-0000-0000-000000000000') {
      throw badRequest('Reserved tenant.');
    }

    // The active site (docs/49 Phase 6): the CommerceSiteTheme write-through is now
    // per-property, so resolve which site this payload reflects (the `?property=`
    // slug, else the primary) and key the theme read by it.
    const propertyId = await resolvePublicPropertyId(tenant.id, query.property ?? null);

    // Storefront theme + commerce defaults travel with the tenant payload so
    // the storefront's root layout resolves everything in a single fetch. The
    // theme row is one-per-(tenant, property); settings stays one-per-tenant. A
    // missing row means the site hasn't customized, so we fall back to
    // nulls/defaults the storefront's token layer reads as "use the default theme".
    const [theme, storefront, brand, consent, propertyRow] = await withTenant(
      { tenantId: tenant.id },
      (tx) =>
        Promise.all([
          // PRESENTATION tokens only. Identity (colors, type, logo, favicon) comes
          // from the tenant brand below — those CommerceSiteTheme columns were removed
          // in migration 20260610000200 (docs/30 §6).
          tx.commerceSiteTheme.findUnique({
            where: { tenantId_propertyId: { tenantId: tenant.id, propertyId } },
            select: {
              colorBackground: true,
              colorMuted: true,
              radiusBase: true,
            },
          }),
          // The active site's settings, inheriting the primary's when the site has
          // no row of its own (docs/49 Phase 6b). Returns the full row; the payload
          // below reads currency/locale/stock/auth off it.
          commerceSiteService.resolveSettingsRow(tx, tenant.id, propertyId),
          // Tenant-level brand is the source of truth for IDENTITY (docs/30 §6):
          // logo/favicon + brand colors + brand type. It WINS over CommerceSiteTheme
          // here; the theme keeps only presentation tokens (background/muted/radius).
          tx.tenantBrand.findUnique({
            where: { tenantId: tenant.id },
            select: {
              businessName: true,
              tagline: true,
              colorPrimary: true,
              colorPrimaryForeground: true,
              colorSecondary: true,
              colorSecondaryForeground: true,
              colorAccent: true,
              colorAccentForeground: true,
              fontHeading: true,
              fontBody: true,
              tokens: true,
              logoLightMediaId: true,
              logoDarkMediaId: true,
              faviconMediaId: true,
            },
          }),
          // Cookie-consent config travels with the tenant payload so the
          // storefront layout decides off/quiet-notice/banner server-side in
          // the same fetch — no second round-trip, no client flash (docs/42 §4).
          readPublicConsentConfig(tx, tenant.id, propertyId),
          // The active site's row — everything per-site the payload needs, keyed by
          // the RESOLVED propertyId (the `?property=` site, else the primary):
          //
          //  · name      — the customer-facing SITE name the storefront renders in
          //                chrome/title/OG. NEVER the tenant's legal/org name.
          //  · settings  — the per-site bag carrying this site's own social links.
          //  · brandOverride — this site's own brand (docs/49 §3, Phase 4).
          //  · moduleScope   — the modules disabled for this site alone.
          //
          // The last two used to be read from a SEPARATE query gated on
          // `query.property` (and looked up by slug), so the PRIMARY site's own
          // brand and module scope were invisible on its bare host — it could only
          // ever show the tenant base. That gate is why branding the primary had to
          // be written to TenantBrand, which is what leaked it to every sibling.
          tx.property.findUnique({
            where: { id: propertyId },
            select: {
              name: true,
              settings: true,
              showPlatformCredit: true,
              brandOverride: true,
              moduleScope: true,
            },
          }),
        ])
    );

    // How this shop can be paid, so the storefront knows BEFORE checkout whether
    // this website takes any money at all (issue 185). A shop on manual payments
    // settles in the room, and a product page that says "Pay $30.00 today" or a
    // basket that says "To pay at checkout" is describing a charge that never
    // happens. Its own query rather than a member of the batch above: it reads
    // through `withTenant` itself, and it never throws.
    const paymentMode = await checkoutService.resolvePaymentMode(tenant.id);

    // Which languages this shop's catalogue is actually WRITTEN in, so the site
    // can offer them and refuse the ones nobody has translated. Derived rather
    // than configured: a language exists here because a real product carries
    // words in it, which is the only definition that cannot go stale.
    const languages = await withTenant({ tenantId: tenant.id }, async (tx) => {
      const rows = await tx.productTranslation.findMany({
        where: { product: { status: 'active', deletedAt: null } },
        distinct: ['locale'],
        select: { locale: true },
        orderBy: { locale: 'asc' },
      });
      return rows.map((row) => row.locale);
    });

    // Merge the per-site override over the tenant brand identity (Phase 4). A
    // null override leaves the tenant brand untouched, so single-site / no-override
    // payloads are byte-for-byte unchanged.
    const override = parseBrandOverride(propertyRow?.brandOverride);
    const identity = mergeBrandIdentity(
      {
        businessName: brand?.businessName ?? null,
        tagline: brand?.tagline ?? null,
        logoLightMediaId: brand?.logoLightMediaId ?? null,
        logoDarkMediaId: brand?.logoDarkMediaId ?? null,
        faviconMediaId: brand?.faviconMediaId ?? null,
        colorPrimary: brand?.colorPrimary ?? null,
        colorPrimaryForeground: brand?.colorPrimaryForeground ?? null,
        colorSecondary: brand?.colorSecondary ?? null,
        colorSecondaryForeground: brand?.colorSecondaryForeground ?? null,
        colorAccent: brand?.colorAccent ?? null,
        colorAccentForeground: brand?.colorAccentForeground ?? null,
        fontHeading: brand?.fontHeading ?? null,
        fontBody: brand?.fontBody ?? null,
        tokens: brand?.tokens ?? null,
      },
      override
    );

    // Brand identity overrides theme identity; theme supplies presentation +
    // fallback. All-null fields are interpreted by the storefront token layer as
    // "use the default theme". `businessName` (when set) is the display name the
    // storefront shows in the header/title/footer. Per-site presentation overrides
    // (colorBackground, colorMuted, colorBorder, radiusBase) win over the theme.
    const mergedTheme =
      theme || brand || override
        ? {
            // Identity — tenant brand, with the per-site override applied
            // (docs/49 "full per-site brand"): logos, colors, and type all
            // resolve to the active site's effective brand.
            colorPrimary: identity.colorPrimary,
            colorPrimaryForeground: identity.colorPrimaryForeground,
            colorAccent: identity.colorAccent,
            fontHeading: identity.fontHeading,
            fontBody: identity.fontBody,
            logoMediaId: identity.logoLightMediaId,
            logoDarkMediaId: identity.logoDarkMediaId,
            faviconMediaId: identity.faviconMediaId,
            // Presentation — per-site override wins over the theme preset.
            colorBackground: override?.colorBackground ?? theme?.colorBackground ?? null,
            colorMuted: override?.colorMuted ?? theme?.colorMuted ?? null,
            colorBorder: override?.colorBorder ?? null,
            radiusBase: override?.radiusBase ?? theme?.radiusBase ?? null,
          }
        : null;

    return ok({
      id: tenant.id,
      slug: tenant.slug,
      // `name` (legal/org tenant name) + `businessName` (brand) stay for rollout
      // back-compat but are NON-authoritative for display. `propertyName` is the
      // customer-facing SITE name the storefront renders (docs/49) — the active
      // site, else the primary. The storefront collapses to it (wizeworks/apps/site/lib/
      // tenant.ts) so chrome/title/OG never show the tenant's legal name.
      name: tenant.name,
      businessName: identity.businessName,
      propertyName: propertyRow?.name ?? null,
      // The brand tagline, with the per-site override applied. Bindable as
      // `site.identity.tagline` — it was resolved here but never returned, so the
      // binding the picker offers could only ever resolve to an empty string (and
      // an empty bound value REPLACES the authored text, blanking the node).
      tagline: identity.tagline,
      // Platform attribution: whether this site shows the footer credit badge.
      // Defaults true so a site predating the column still shows it. The badge
      // names no product here — the site resolves which one from `platformBrand`
      // below, which is why this field is not named after either of them.
      showPlatformCredit: propertyRow?.showPlatformCredit ?? true,
      // Not a brand NAME — the key. The site resolves the name, accent and link
      // from it through @wizeworks/brand-core, so adding a third brand is
      // configuration rather than a payload change.
      platformBrand: tenant.platformBrand,
      settings: tenant.settings,
      // PER-SITE social links (docs/49 "full per-site brand"): each site has its
      // own, stored in the property settings bag. Falls back to the tenant-level
      // links (legacy / not-yet-set) so existing single-site links keep rendering.
      socials: readSiteSocials(propertyRow?.settings, tenant.socials),
      // PER-SITE contact details — the phone/email/postal address a starter site's
      // Contact page binds. No tenant fallback (see readSiteContact).
      contact: readSiteContact(propertyRow?.settings),
      theme: mergedTheme,
      commerce: {
        // Per-site override wins; falls back to tenant CommerceSiteSettings then hardcoded default.
        defaultCurrency: override?.defaultCurrency ?? storefront?.defaultCurrency ?? 'USD',
        defaultLocale: override?.defaultLocale ?? storefront?.defaultLocale ?? 'en-US',
        showStockBelow: storefront?.showStockBelow ?? 10,
        // Per-site commerce gating: the brand_override wins over the tenant setting.
        hidePricesWhenSignedOut:
          override?.hidePricesWhenSignedOut ?? storefront?.hidePricesWhenSignedOut ?? false,
        requireAuthForCheckout: storefront?.requireAuthForCheckout ?? false,
        // Tenant-level, not per-site: one business has one way of being paid.
        paymentMode,
      },
      // The catalogue's other languages, empty when nobody has translated
      // anything. The site reads it to decide whether to offer a choice at all —
      // an empty list means one language, and no switcher.
      languages,
      consent,
      // Per-site disabled modules (docs/49 Slice F). Empty = all tenant-active
      // modules are on. The storefront uses this to gate module-specific routes
      // (e.g. a wholesale site with commerce disabled shows a static catalogue).
      disabledModules: Array.isArray(propertyRow?.moduleScope)
        ? (propertyRow.moduleScope as string[]).filter((v) => typeof v === 'string')
        : [],
      // Billing lifecycle phase (docs/17 §6). ONLY the phase string is exposed —
      // never the trial/grace DATES — so this public payload leaks no billing
      // timeline. The storefront serves the suspend overlay iff this is 'suspended';
      // every other phase renders the site normally (grace keeps the site live).
      billingPhase: resolveBillingPhase({
        subscriptionStatus: tenant.subscriptionStatus,
        trialEndsAt: tenant.trialEndsAt,
        currentPeriodEnd: tenant.currentPeriodEnd,
        planType:
          (tenant.settings as { billing?: { planType?: string } } | null)?.billing?.planType ===
          'enterprise'
            ? 'enterprise'
            : 'standard',
        exempt: isPlatformTenant(tenant.id),
      }).phase,
    });
  });
  return Promise.resolve();
};

export default publicContentRoutes;
