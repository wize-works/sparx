// Tenant-scoped sitemap. Proxies api-rest's /v1/sitemap.xml?tenant=<slug>
// keyed off the Host header. Cached at the edge for 5 min (same as
// api-rest's own Cache-Control on the underlying endpoint).

import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

export async function GET() {
  const tenant = await resolveTenant();
  if (!tenant) {
    return new Response('Not found', { status: 404 });
  }

  const res = await fetch(`${BASE_URL}/v1/sitemap.xml?tenant=${encodeURIComponent(tenant.slug)}`, {
    next: { revalidate: 300, tags: [`tenant:${tenant.slug}`, 'sparx-storefront'] },
  });
  if (!res.ok) {
    return new Response('', { status: 502 });
  }
  const xml = await res.text();
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
