// What a link on a sparx storefront is allowed to point at.
//
// Two halves. The BUILT-IN half is the storefront's own route table (`wizeworks/apps/site/app`)
// — cart, checkout, search, the account area, and the dynamic record routes. It is
// knowledge about this platform, not about any tenant, so it lives in code and is
// checked into a test that walks the real route files (`routes.test.ts`) rather than
// being remembered. The AUTHORED half — pages, product handles, collection handles —
// comes from the caller, because only the caller can look it up.
//
// The bias throughout is against false positives. Telling an owner that a page that
// works is broken is worse than missing one that is: the first makes them distrust
// every finding, the second only costs them the one they already had. So anything
// this file cannot resolve with certainty resolves as FINE.

import { RECORD_ADDRESSES } from '@wizeworks/silica-catalog';

/** Routes the storefront serves that take no parameter. */
export const BUILTIN_PATHS: readonly string[] = [
  '/',
  '/cart',
  '/checkout',
  '/checkout/save-card',
  '/search',
  '/products',
  '/collections',
  '/category',
  '/book',
  '/account',
  '/sitemap.xml',
  '/robots.txt',
  '/llms.txt',
];

/**
 * Subtrees served in full, where enumerating every leaf would be more likely to be
 * wrong than useful.
 *
 * `/account/*` is the signed-in area — a dozen routes today (orders, addresses,
 * wishlist, bookings, estimates, the whole B2B section with its own nested pages),
 * several of them two parameters deep. Listing them here would mean this file
 * silently going stale every time the account area grows, and the failure mode of
 * staleness is the bad one: flagging a link to a route that exists.
 *
 * `/api/*` is served by route handlers, never by the page router.
 *
 * `/sign/*` is here for a DIFFERENT reason, and the difference is worth keeping
 * straight. It is one leaf, not a dozen — but its parameter is a signing token,
 * an opaque credential mailed to one person, so there is no roster that could
 * ever enumerate the valid values the way `productHandles` enumerates products.
 * It is also unreachable by design: nothing on the storefront links to it, so
 * the link-checking this table feeds has nothing to check. A `DYNAMIC_ROUTES`
 * entry would have to invent a roster and a noun for a route that has neither.
 *
 * `/booking/*` is `/sign/*`'s twin and shares its reason exactly: one leaf, whose
 * parameter is an HMAC naming one booking, mailed to the one person who made it.
 * There is no roster of valid tokens and nothing on the storefront links to it —
 * the confirmation email does. It exists so a guest who booked without an account
 * can reach her own appointment (issue 153); a login wall was the alternative.
 *
 * `/meet/*` (docs/144 §12) is the booking-link page, and its reason is a fourth
 * one again. Its parameter is NOT opaque — a meeting-link slug is tenant-chosen
 * and could be enumerated, unlike a signing token — so this is the one entry
 * here that a roster could one day promote into `DYNAMIC_ROUTES`. It stays open
 * because no caller supplies that roster: `site-check` builds targets from
 * products, collections and posts only, so a `DYNAMIC_ROUTES` entry today would
 * resolve every genuine `/meet/…` link against an empty list and report all of
 * them broken. That is the false positive this file's header says to avoid, and
 * it is worse than the miss — a link a customer was emailed directly is not one
 * the link checker was ever protecting.
 */
export const OPEN_SUBTREES: readonly string[] = [
  '/account/',
  '/api/',
  '/sign/',
  '/booking/',
  '/meet/',
];

/** Which caller-supplied roster backs each parameterized route. */
export type RosterKey =
  'productHandles' | 'collectionHandles' | 'categoryHandles' | 'postSlugs' | 'serviceIds';

export interface DynamicRoute {
  /** Always with a trailing slash — `/products/`. The trailing slash is load-bearing:
   *  consumers match with `startsWith`, and `/products` would also claim
   *  `/products-archive`.
   *
   *  DERIVED from `@wizeworks/silica-catalog`'s `RECORD_ADDRESSES`, not written here — see
   *  the note on `DYNAMIC_ROUTES`. */
  prefix: string;
  roster: RosterKey;
  /** What the parameter IS, in an owner's words, for the finding text. */
  noun: string;
  /** The builder record type whose collection TEMPLATE renders this route — the same
   *  keys as `@wizeworks/silica-catalog`'s `ROUTED_RECORD_TYPES`.
   *
   *  Here rather than in a second map because it is the missing half of the same fact.
   *  A collection page's slug is a template address, not a location: visitors land on
   *  `/products/brake-kit`, never on the template, so anything joining real traffic
   *  back to the page that produced it needs `recordType → prefix`. Two parallel
   *  five-row lists would drift; `routes.test.ts` asserts this one covers the
   *  catalog's exactly. */
  recordType: string;
}

/** What this package adds to an address: the roster that decides whether a given
 *  parameter resolves, and the owner-facing noun for the finding text. Neither belongs
 *  in the catalog — a roster is a lint concern and a noun is copy. */
const ROUTE_EXTRAS: Record<string, { roster: RosterKey; noun: string }> = {
  'commerce.product': { roster: 'productHandles', noun: 'product' },
  'commerce.collection': { roster: 'collectionHandles', noun: 'collection' },
  'commerce.category': { roster: 'categoryHandles', noun: 'category' },
  'cms.blog_post': { roster: 'postSlugs', noun: 'blog post' },
  'scheduling.service': { roster: 'serviceIds', noun: 'bookable service' },
};

/**
 * The parameterized storefront routes.
 *
 * `prefix` and `recordType` are DERIVED from `@wizeworks/silica-catalog`'s
 * `RECORD_ADDRESSES` rather than written out again. They used to be a second five-row
 * list here, kept honest by a test asserting it covered the catalog's exactly — which
 * is a drift detector, not an absence of drift. The catalog now owns the fact (it is
 * the same fact that gives a record page its address), this package contributes only
 * what is genuinely its own, and the two cannot disagree because there is one list.
 */
export const DYNAMIC_ROUTES: readonly DynamicRoute[] = RECORD_ADDRESSES.map((a) => ({
  prefix: a.prefix,
  recordType: a.recordType,
  ...ROUTE_EXTRAS[a.recordType]!,
}));

/** Where visitors to a record page's records actually land, or null for a record type
 *  the storefront has no route for. */
export function routePrefixForRecordType(recordType: string): string | null {
  return DYNAMIC_ROUTES.find((r) => r.recordType === recordType)?.prefix ?? null;
}

/** Is this path inside a subtree served wholesale? */
export function inOpenSubtree(path: string): boolean {
  return OPEN_SUBTREES.some((prefix) => path.startsWith(prefix));
}

/**
 * Normalize an authored path to the one spelling everything else compares against:
 * a leading slash, no trailing slash (except the root), no query and no hash.
 *
 * Page slugs are authored inconsistently — silica's `makePage` takes `/pricing`,
 * the sparx page editor stores `pricing`, and a hand-typed href may carry a trailing
 * slash — so all four spellings of the same page have to collapse to one before any
 * comparison, or every link to the home page reads as broken.
 */
export function normalizePath(raw: string): string {
  let path = raw.trim();
  const cut = Math.min(
    ...[path.indexOf('?'), path.indexOf('#')].filter((i) => i >= 0).concat([path.length])
  );
  path = path.slice(0, cut);
  if (!path.startsWith('/')) path = `/${path}`;
  while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path === '' ? '/' : path;
}

/**
 * Resolve a relative href against the page it was authored on.
 *
 * `about` on `/` means `/about`; on `/guides/setup` it means `/guides/about`. An
 * author typing into a builder almost always means the first, but "almost always"
 * is not a basis for calling their link broken — so it is resolved the way a browser
 * resolves it, and judged on that.
 */
export function resolveRelative(href: string, fromPath: string): string {
  const base = normalizePath(fromPath);
  const dir = base.slice(0, base.lastIndexOf('/') + 1);
  const segments: string[] = [];
  for (const part of `${dir}${href}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return normalizePath(`/${segments.join('/')}`);
}
