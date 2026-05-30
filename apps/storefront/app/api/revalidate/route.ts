// On-demand cache invalidation for the storefront's Data Cache.
//
// Storefront pages are dynamically rendered (the tenant is resolved from the
// Host header, which opts the route out of static generation), but every read
// to api-rest is fetch-cached with `next: { revalidate, tags }` — tagged
// `tenant:<slug>`, `products:<slug>`, `collections:<slug>`, `content:<slug>`.
// Those caches would otherwise only expire on their TTL; this endpoint lets the
// platform purge them immediately when a catalog/content edit lands.
//
// Trigger: api-rest (or a Pub/Sub worker reacting to product.updated /
// collection.updated / content.published) POSTs here after a mutation. Secured
// by a shared secret in the `x-revalidate-secret` header (constant-time compare).
//
//   POST /api/revalidate
//   header: x-revalidate-secret: <SPARX_REVALIDATE_SECRET>
//   body:   { "tenant": "acme", "scopes": ["products"] }   // scopes optional
//
// With no scopes (or "all"), every scope for the tenant is purged.

import crypto from 'node:crypto';

import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

const SECRET = process.env.SPARX_REVALIDATE_SECRET ?? '';
const SCOPES = ['products', 'collections', 'content'] as const;
type Scope = (typeof SCOPES)[number];

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!SECRET) {
    return NextResponse.json(
      { success: false, error: 'Revalidation is not configured.' },
      { status: 503 }
    );
  }
  const provided = request.headers.get('x-revalidate-secret') ?? '';
  if (!timingSafeEqual(provided, SECRET)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  let body: { tenant?: unknown; scopes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const tenant = typeof body.tenant === 'string' ? body.tenant.trim() : '';
  if (!tenant) {
    return NextResponse.json({ success: false, error: 'tenant is required.' }, { status: 400 });
  }

  const requested = Array.isArray(body.scopes)
    ? (body.scopes.filter((s): s is Scope => SCOPES.includes(s as Scope)) as Scope[])
    : [];
  const scopes = requested.length ? requested : [...SCOPES];

  const purged = [`tenant:${tenant}`, ...scopes.map((s) => `${s}:${tenant}`)];
  for (const tag of purged) revalidateTag(tag);

  return NextResponse.json({ success: true, data: { tenant, purged } });
}
