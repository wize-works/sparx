// Tenant resolution at the edge.
//
// Production: the tenant is derived from the Host header inside resolveTenant()
// (subdomain of sparx.zone, or a custom domain later). Middleware doesn't need
// to do anything there.
//
// Local dev: there's no per-tenant DNS, so we accept `?tenant=<slug>`, stash it
// in an `x-tenant-slug` request header (read by resolveTenant) AND persist it
// as a cookie so navigating between pages keeps the active store without
// re-appending the query param.

import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = 'sparx_dev_tenant';

export function middleware(req: NextRequest) {
  const fromQuery = req.nextUrl.searchParams.get('tenant');
  const fromCookie = req.cookies.get(COOKIE)?.value;
  const slug = fromQuery ?? fromCookie;

  const requestHeaders = new Headers(req.headers);
  if (slug) requestHeaders.set('x-tenant-slug', slug);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (fromQuery && fromQuery !== fromCookie) {
    res.cookies.set(COOKIE, fromQuery, { httpOnly: false, sameSite: 'lax', path: '/' });
  }
  return res;
}

export const config = {
  // Skip Next internals + the health probe; everything else gets tenant context.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/health).*)'],
};
