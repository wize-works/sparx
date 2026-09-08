// Tenant resolution at the edge (Next.js `proxy` file convention — formerly
// `middleware`).
//
// Production: the tenant + site are derived from the Host header inside
// resolveSite() (a `*.sparx.zone` subdomain, or a connected custom domain). The
// proxy does NOT influence site selection there — see the dev-override note below.
//
// Local dev: there's no per-tenant DNS, so we accept `?tenant=<slug>` (and
// `?property=<slug>`), stash them in `x-tenant-slug` / `x-property-slug` request
// headers (read by resolveSite) AND persist them as cookies so navigating between
// pages keeps the active site without re-appending the query param.
//
// IMPORTANT (multi-site routing footgun): the `?tenant=`/`?property=` override and
// its cookies are a LOCAL-DEV affordance ONLY. In production every site has a real
// Host (`<slug>.<tenant>.sparx.zone` or a custom domain). If a production browser
// ever picked up a `sparx_dev_tenant` cookie (e.g. by visiting a storefront once
// with `?tenant=`), a resolver that trusted that override would pin EVERY
// `*.sparx.zone` host it opened to one site — and, since the cookie carries only the
// TENANT slug, to that tenant's PRIMARY site: the "all my sites load the same one"
// bug. Defense in depth closes it from both ends: (a) here, the override is gated
// strictly to LOCAL hosts — decided from the real public host (`publicHost`), not
// `req.nextUrl.hostname` — and on any real host we never set those headers AND we
// actively EXPIRE the dev cookies, so an already-affected browser self-heals on its
// next request; and (b) the resolver (lib/site-context `resolveSiteRoute`) treats the
// public host as authoritative and consults the override ONLY on a local-dev host, so
// even a leaked override header can never re-point a real host.
//
// Site preview: the page components read the `?sparxSitePreview=` draft token
// straight off their `searchParams`, but the root layout (which renders the
// header / footer / announcement chrome) can't see searchParams. So we mirror
// the token into an `x-sparx-site-preview` request header here — in ALL
// environments — letting the layout fetch the DRAFT chrome too. (This is a signed
// preview token scoped to the host's own tenant, not a site selector, so it is
// unaffected by the dev-override gating.)

import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = 'sparx_dev_tenant';
// Local-dev multi-site selector (docs/49): `?property=<slug>` picks which of the
// tenant's sites to render without per-site DNS. Mirrors the tenant cookie.
const PROPERTY_COOKIE = 'sparx_dev_property';

// The reader's chosen language. NOT a dev override — it is a real visitor
// preference on every host, so it is handled before the local-dev branch and
// survives into production.
const LANG_COOKIE = 'sparx_lang';
const LANG_HEADER = 'x-sparx-lang';
// The BCP-47 shape api-rest accepts. Anything else is dropped rather than
// forwarded, so a hand-typed `?lang=<script>` never reaches a query string.
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|\d{3}))?$/;

/** The language this request should read in, and whether the visitor just chose
 *  it. `?lang=` with no value means "back to the shop's own words". */
function readerLanguage(req: NextRequest): { value: string | null; chosen: boolean } {
  const raw = req.nextUrl.searchParams.get('lang');
  if (raw !== null) return { value: LANG_RE.test(raw.trim()) ? raw.trim() : null, chosen: true };
  const cookie = req.cookies.get(LANG_COOKIE)?.value ?? '';
  return { value: LANG_RE.test(cookie) ? cookie : null, chosen: false };
}

/**
 * Mirror the language onto the REQUEST headers, and return what to remember.
 *
 * Split in two because `NextResponse.next({ request: { headers } })` snapshots
 * the headers as it is constructed: setting one afterwards changes nothing, and
 * the page reads no language at all.
 */
function mirrorLanguage(
  req: NextRequest,
  requestHeaders: Headers
): ReturnType<typeof readerLanguage> {
  const lang = readerLanguage(req);
  if (lang.value) requestHeaders.set(LANG_HEADER, lang.value);
  else requestHeaders.delete(LANG_HEADER);
  return lang;
}

/** Remember an explicit choice, so the next page stays in that language. */
function rememberLanguage(
  res: NextResponse,
  lang: ReturnType<typeof readerLanguage>
): NextResponse {
  if (!lang.chosen) return res;
  if (lang.value) {
    res.cookies.set(LANG_COOKIE, lang.value, { httpOnly: false, sameSite: 'lax', path: '/' });
  } else {
    res.cookies.set(LANG_COOKIE, '', { path: '/', maxAge: 0 });
  }
  return res;
}

// The dev override is valid ONLY on local hosts — the one place there's no
// per-tenant DNS. Every production host (a real `*.sparx.zone` subdomain or a
// connected custom domain) carries the site in the Host header, so it must resolve
// by Host alone and never trust the `?tenant=`/`?property=` cookies.
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

// The real PUBLIC host. We deliberately read the forwarded/Host header rather than
// `req.nextUrl.hostname`: behind the ingress (Caddy/GKE) `req.nextUrl.hostname` can
// resolve to an INTERNAL address, which would mis-classify a real `*.sparx.zone`
// request as local-dev — firing the dev override in production AND skipping the
// cookie-expiry below, so a poisoned `sparx_dev_tenant` cookie would never self-heal.
// The header carries the same public host the resolver keys off (lib/site-context).
function publicHost(req: NextRequest): string {
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.hostname;
}

export function proxy(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);

  // Site preview (every environment): mirror the draft token so the root layout
  // can fetch DRAFT chrome. Not a site selector — always honored.
  const previewToken = req.nextUrl.searchParams.get('sparxSitePreview');
  if (previewToken) requestHeaders.set('x-sparx-site-preview', previewToken);

  // The route's PATH, for the root layout (docs/silicaui/01 §5). Per-page frames — a landing
  // page with no header or footer — need the layout to know WHICH page it is wrapping,
  // and the App Router gives a layout its children but never their route. Next does not
  // expose the pathname to a server component either, so it is mirrored here. Query and
  // hash are deliberately excluded: chrome is chosen per page, not per filter.
  requestHeaders.set('x-sparx-path', req.nextUrl.pathname);

  // ── Local dev: honor the `?tenant=`/`?property=` site override ──────────────
  if (isLocalDevHost(publicHost(req))) {
    const fromQuery = req.nextUrl.searchParams.get('tenant');
    const fromCookie = req.cookies.get(COOKIE)?.value;
    const slug = fromQuery ?? fromCookie;
    const propertyQuery = req.nextUrl.searchParams.get('property');
    const propertyCookie = req.cookies.get(PROPERTY_COOKIE)?.value;
    const propertySlug = propertyQuery ?? propertyCookie;

    if (slug) requestHeaders.set('x-tenant-slug', slug);
    if (propertySlug) requestHeaders.set('x-property-slug', propertySlug);

    const lang = mirrorLanguage(req, requestHeaders);
    const res = rememberLanguage(NextResponse.next({ request: { headers: requestHeaders } }), lang);
    if (fromQuery && fromQuery !== fromCookie) {
      res.cookies.set(COOKIE, fromQuery, { httpOnly: false, sameSite: 'lax', path: '/' });
    }
    if (propertyQuery && propertyQuery !== propertyCookie) {
      res.cookies.set(PROPERTY_COOKIE, propertyQuery, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
      });
    }
    return res;
  }

  // ── Production (any real host): never honor the dev override ────────────────
  // Strip the headers defensively (a client can't spoof site selection), and
  // expire any stale dev cookies so a poisoned browser resolves purely by Host
  // from now on.
  requestHeaders.delete('x-tenant-slug');
  requestHeaders.delete('x-property-slug');
  const lang = mirrorLanguage(req, requestHeaders);
  const res = rememberLanguage(NextResponse.next({ request: { headers: requestHeaders } }), lang);
  if (req.cookies.has(COOKIE)) res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  if (req.cookies.has(PROPERTY_COOKIE))
    res.cookies.set(PROPERTY_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

export const config = {
  // Skip Next internals + the health probe; everything else gets tenant context.
  //
  // `robots.txt`, `sitemap.xml` and `favicon.ico` USED TO BE SKIPPED TOO, and they are
  // the three routes that most need not to be. Each resolves its tenant from the Host
  // header, which is right in production and impossible in local dev — there is no
  // per-tenant DNS here, which is the whole reason the `?tenant=` override exists. Left
  // out of the matcher they never received it, so `localhost:3004/sitemap.xml?tenant=…`
  // answered a flat `Not found` and `robots.txt` answered `Disallow: /`. Nobody could
  // look at a tenant's sitemap on their own machine, which is how it came to be shipping
  // `https://host//shop` on eight tenants with nothing to notice it (issue 275).
  //
  // In production the proxy does the opposite for these paths and that is also wanted:
  // it STRIPS any `x-tenant-slug` a client sent, which they were previously exempt from.
  matcher: ['/((?!_next/static|_next/image|api/health).*)'],
};
