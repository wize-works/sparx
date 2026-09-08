// Which stored page audits belong to the site being looked at.
//
// WHY THIS EXISTS. `seo_audits` carries a `property_id` — and not one of its four
// indexes mentions it, because until now no read filtered on it. So a clothing
// maker with seven websites opened "How people find you" on her shop and read
// **51 pages checked, average 77**, when her shop has 42 and averages 76: the
// other nine were her Archive site's pages, scored against a different domain
// with different content, quietly pulling her number down (issue 391).
//
// TWO TIERS, not one, and the second is load-bearing. A `builder_page` audit
// carries the site its page belongs to. A `cms_page` / `product` / `collection`
// audit carries NULL, because those entities express their own site visibility
// through junction tables rather than a column — so NULL here means "not pinned
// by this row", and dropping those would have taken 20 of her 42 pages off the
// screen to fix a 9-page error.
//
// The residual is stated rather than hidden: an entity pinned to ANOTHER site
// still counts here, because its audit row does not carry the pin. Closing that
// needs the indexer to stamp `property_id` for those three entity types, which is
// a change to what is written rather than to what is read.

import type { Prisma } from '@wizeworks/db';

/** The Prisma form, for `seoAudit.findMany` / `.count`. */
export function auditsOnSite(propertyId: string | undefined): Prisma.SeoAuditWhereInput {
  // `OR` rather than `in: [id, null]` — Prisma's `in` rejects null even on a
  // nullable column, the same note `lib/ai/tool-policy.ts` carries.
  return propertyId ? { OR: [{ propertyId }, { propertyId: null }] } : {};
}
