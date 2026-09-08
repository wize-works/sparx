// Public universal search for storefronts (docs/39 §9).
//
//   GET /v1/public/search ?tenant=<slug>&q=<query>[&property=&page=&perPage=]
//
// SITE SCOPE (docs/131, docs/113 §1). A tenant can own several unrelated
// businesses. This route filtered on tenant alone, so a shopper searching the
// fishing store — through the storefront or through that site's MCP endpoint,
// which injects `?property=` on every call — also got the machine shop's
// products and pages. Every other public read already scopes; this one did not.
//
// The filter is applied during HYDRATION rather than in Typesense, deliberately.
// The `entities` collection carries no property field (unlike `products`, which
// has `property_ids`, and `customers`/`orders`, which have `property_id`), so an
// index-level filter would need a schema change AND a full reindex before it
// could be switched on — and between deploy and reindex every un-backfilled doc
// would silently vanish from search. Hydration already re-reads each hit from
// Postgres to build its URL and drop stale rows, so the site predicates cost
// nothing extra there and are the AUTHORITATIVE ones the rest of the public API
// uses (`productSiteVisibilityWhere` and friends: unscoped = every site, scoped
// = only those).
//
// The cost of that choice is `total`: it is Typesense's pre-filter count, so on
// a multi-site tenant it OVERSTATES. Making it exact means putting the filter in
// the index, which is the reindex-gated follow-up (docs/152 A4b). Until then the
// field is documented as an upper bound rather than quietly wrong.
//
// "Search everything" on the tenant's public website — products, collections,
// and CMS pages in one typo-tolerant query against the universal `entities`
// collection. Hard-gated to PUBLIC-safe entity types + published/active status,
// so internal entities (orders, customers, discounts, b2b accounts, quotes, …)
// are never reachable here even though they share the collection. No auth;
// tenant by slug (identical to the other /v1/public/* surfaces).
//
// The universal doc's `url` is the ADMIN deep-link (dashboard editor), so we
// hydrate handle/slug from the owning table and build the STOREFRONT path —
// mirroring how the public product search hydrates display rows from Postgres.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { ok } from '@wizeworks/api-core/envelope';
import {
  collectionSiteVisibilityWhere,
  contentSiteVisibilityWhere,
  productSiteVisibilityWhere,
  withTenant,
} from '@wizeworks/db';
import { searchAll } from '@wizeworks/search';
import { resolvePublicPropertyId } from '../../../lib/property.js';
import { requireTenantIdBySlug } from '../../../lib/tenant-slug.js';

// Only entity types with a public storefront page. Categories are an admin
// organizational concept (no storefront route) and stay out.
//
// `cms_entry` is here because it is where a shop's ARTICLES live — every content
// type except `page`. Without it, searching a site for anything its owner wrote
// returned nothing and offered "Browse all products", on sites whose own footer
// links a Return Policy and a Journal (issue 378). Whether a given entry has a
// public address at all is decided per row below, from its type's `urlPattern`.
export const PUBLIC_ENTITY_TYPES = ['product', 'collection', 'cms_page', 'cms_entry'];
// Products are 'active', CMS pages are 'published', collections are 'active'.
const PUBLIC_STATUSES = ['active', 'published'];

const SearchQuery = z.object({
  tenant: z.string().min(1).max(63),
  q: z.string().optional(),
  // Which site is being searched. Omitted resolves to the tenant's PRIMARY site,
  // the same fallback every other public read takes — never "all sites", so a
  // caller that forgets the parameter gets one business's results rather than a
  // blend of all of them.
  property: z.string().min(1).max(63).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

// Cached in lib/tenant-slug.ts (docs/127 §5).
const resolveTenantBySlug = requireTenantIdBySlug;

interface Hit {
  entity_type: string;
  record_id: string;
}

/** A hit that survived the site + publish-state re-check: where it lives, and what
 *  KIND of thing it is in the tenant's own words (CMS types only — a product or a
 *  collection is named by its entity type already). */
interface Resolved {
  url: string;
  kind?: string;
}

/** `/blog/{slug}` + `caring-for-knitwear` → `/blog/caring-for-knitwear`. A pattern
 *  with no placeholder is left alone rather than silently losing the slug. */
export function pathFrom(urlPattern: string, slug: string): string {
  return urlPattern.includes('{slug}') ? urlPattern.replace('{slug}', slug) : urlPattern;
}

// Build the storefront-facing path for each hit by hydrating handle/slug from
// the owning table. Re-checks publish/active state so a doc that went stale
// between index and read is dropped rather than linked to a dead page, and
// applies the SITE predicate so another business's records are dropped too.
//
// A hit with no surviving row simply gets no URL and is skipped by the caller,
// which is the same path a stale doc already took — so "not on this site" needs
// no separate branch, and cannot be mistaken for "found but unlinkable".
async function publicUrlsFor(
  tenantId: string,
  propertyId: string,
  hits: Hit[]
): Promise<Map<string, Resolved>> {
  const idsOf = (type: string) =>
    hits.filter((h) => h.entity_type === type).map((h) => h.record_id);
  const urls = new Map<string, Resolved>();

  await withTenant({ tenantId }, async (tx) => {
    const productIds = idsOf('product');
    if (productIds.length > 0) {
      const rows = await tx.product.findMany({
        where: {
          id: { in: productIds },
          status: 'active',
          deletedAt: null,
          ...productSiteVisibilityWhere(propertyId),
        },
        select: { id: true, handle: true },
      });
      for (const r of rows) urls.set(`product:${r.id}`, { url: `/products/${r.handle}` });
    }

    const collectionIds = idsOf('collection');
    if (collectionIds.length > 0) {
      const rows = await tx.productCollection.findMany({
        where: {
          id: { in: collectionIds },
          deletedAt: null,
          ...collectionSiteVisibilityWhere(propertyId),
        },
        select: { id: true, handle: true },
      });
      for (const r of rows) urls.set(`collection:${r.id}`, { url: `/collections/${r.handle}` });
    }

    // Both CMS types resolve out of `content_entries` — a `cms_page` is an entry
    // whose typeKey is `page`, a `cms_entry` is any of the others. This read used
    // to go to the deprecated `Page` MODEL, which holds zero rows platform-wide,
    // so the branch could never match (issue 378).
    const entryIds = [...idsOf('cms_page'), ...idsOf('cms_entry')];
    if (entryIds.length > 0) {
      const rows = await tx.contentEntry.findMany({
        where: {
          id: { in: entryIds },
          status: 'published',
          deletedAt: null,
          slug: { not: null },
          ...contentSiteVisibilityWhere(propertyId),
        },
        select: { id: true, slug: true, typeKey: true },
      });
      // The type's own `urlPattern` is what says whether a kind of entry has a
      // public address AND what that address looks like: `page` is `/{slug}`, a
      // blog post `/blog/{slug}`, and an FAQ or a testimonial has none at all —
      // those are composed INTO other pages, so a hit on one must not be offered
      // as a link to a page that does not exist.
      const types = await tx.contentType.findMany({
        where: { key: { in: [...new Set(rows.map((r) => r.typeKey))] } },
        select: { key: true, name: true, urlPattern: true },
      });
      const typeOf = new Map(types.map((t) => [t.key, t]));
      for (const r of rows) {
        const type = typeOf.get(r.typeKey);
        if (!type?.urlPattern || !r.slug) continue;
        const key = r.typeKey === 'page' ? 'cms_page' : 'cms_entry';
        // The TYPE's own name — "Blog post", "Event", "Job posting" — because one
        // `cms_entry` hit can be any of ten kinds, and a caller that only knows the
        // entity type can label them all nothing better than "Result".
        urls.set(`${key}:${r.id}`, { url: pathFrom(type.urlPattern, r.slug), kind: type.name });
      }
    }
  });

  return urls;
}

const publicSearchRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/public/search', async (request) => {
    const q = SearchQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);

    const result = await searchAll({
      tenantId,
      q: q.q,
      entityTypes: PUBLIC_ENTITY_TYPES,
      statuses: PUBLIC_STATUSES,
      page: q.page,
      perPage: q.perPage,
    });

    const docs = result.hits.map((h) => h.document);
    const urls = await publicUrlsFor(
      tenantId,
      propertyId,
      docs.map((d) => ({ entity_type: d.entity_type, record_id: d.record_id }))
    );

    // Preserve Typesense relevance order; drop any hit whose row vanished.
    const results = docs.flatMap((d) => {
      const hit = urls.get(`${d.entity_type}:${d.record_id}`);
      if (!hit) return [];
      return [
        {
          type: d.entity_type,
          title: d.title,
          subtitle: d.subtitle ?? null,
          url: hit.url,
          kind: hit.kind ?? null,
        },
      ];
    });

    // `total` is Typesense's pre-filter count: an UPPER BOUND, not the number of
    // rows in `results`. See the site-scope note in the file header.
    return ok({ results, total: result.found });
  });

  return Promise.resolve();
};

export default publicSearchRoutes;
