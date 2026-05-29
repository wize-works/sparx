// Tenant resolution from the incoming Host header.
//
// Three lookup orders, in priority:
//   1. Exact match on `tenants.primary_domain`           (e.g. acme.com)
//   2. Subdomain of sparx.zone                           (e.g. acme.sparx.zone → slug=acme)
//   3. Query-param fallback for local dev                (?tenant=foo)
//
// The api-rest endpoint /v1/public/tenants/:slug accepts a slug, so case 1
// would technically need a second endpoint that resolves by primary_domain.
// That's deferred — for now we only handle case 2 (subdomain) and case 3
// (dev fallback). Custom domains land when merchants need them.

import { headers } from 'next/headers';
import { cache } from 'react';

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';
const ZONE_DOMAIN = process.env.SPARX_ZONE_DOMAIN ?? 'sparx.zone';

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  settings: Record<string, unknown>;
}

interface TenantApiResponse {
  success: boolean;
  data?: ResolvedTenant;
  error?: { code: string; message: string };
}

// Extracts the tenant slug from a host like `acme.sparx.zone` → `acme`.
// Returns null when the host isn't a sparx.zone subdomain. Strips port.
export function slugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const noPort = host.split(':')[0]?.toLowerCase();
  if (!noPort) return null;
  const suffix = `.${ZONE_DOMAIN}`;
  if (noPort === ZONE_DOMAIN) return null;
  if (!noPort.endsWith(suffix)) return null;
  const sub = noPort.slice(0, -suffix.length);
  // Reject deeper subdomains (foo.bar.sparx.zone) — only single-level for now.
  if (sub.includes('.') || sub.length === 0) return null;
  return sub;
}

// Cached per-request so layout + page can both resolve the tenant without a
// double fetch. React.cache() dedupes within a single server render.
export const resolveTenant = cache(async (): Promise<ResolvedTenant | null> => {
  const hdrs = await headers();
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host');
  const slug = slugFromHost(host);
  if (!slug) return null;

  try {
    const res = await fetch(`${BASE_URL}/v1/public/tenants/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300, tags: [`tenant:${slug}`] },
    });
    const json = (await res.json()) as TenantApiResponse;
    if (!res.ok || !json.success || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
});
