// Server-side CMS reads for the storefront. Mirror of apps/web/lib/sparx-content
// but tenant-aware — the tenant slug is resolved per-request from the Host.
//
// Preview tokens: when the request carries `?sparxPreview=<jwt>` we forward it
// to api-rest via the `Authorization: Preview <jwt>` header. api-rest validates
// the token and, if it grants this entry, returns the draft body. Failing
// validation just falls back to the published-only path.

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

export interface ApiEntry<TBody = Record<string, unknown>> {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: TBody;
  seo: Record<string, unknown>;
  published_at: string | null;
  updated_at: string;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: unknown;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; request_id?: string };
}

async function publicGet<T>(
  path: string,
  query: Record<string, string | number>,
  options: { previewToken?: string; tag?: string } = {}
): Promise<T> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)]))
  );
  const headers: Record<string, string> = {};
  if (options.previewToken) {
    headers.Authorization = `Preview ${options.previewToken}`;
  }
  const res = await fetch(`${BASE_URL}${path}?${qs.toString()}`, {
    headers,
    next: options.previewToken
      ? { revalidate: 0 }
      : {
          revalidate: 300,
          tags: options.tag ? ['sparx-storefront', options.tag] : ['sparx-storefront'],
        },
    cache: options.previewToken ? 'no-store' : undefined,
  });
  const json = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  if (!res.ok || 'error' in json) {
    const code = 'error' in json ? json.error.code : 'UNKNOWN';
    const message = 'error' in json ? json.error.message : `HTTP ${res.status}`;
    throw Object.assign(new Error(`api-rest ${path}: ${code}: ${message}`), { code });
  }
  return json.data;
}

export interface PageBody {
  title?: string;
  content?: { type: string; content?: unknown[] };
  // Tenants can use whatever body shape they want — `title` + `content`
  // is the convention apps/dashboard's page schema uses. Anything else
  // shows up under body[key] and the renderer ignores unrecognized fields.
  [key: string]: unknown;
}

export async function getPageBySlug(
  tenantSlug: string,
  slug: string,
  options: { previewToken?: string } = {}
): Promise<ApiEntry<PageBody> | null> {
  const fetchOnce = (withPreview: boolean) =>
    publicGet<ApiEntry<PageBody>>(
      '/v1/public/content/entries/by-slug',
      { tenant: tenantSlug, type: 'page', slug },
      {
        ...(withPreview && options.previewToken ? { previewToken: options.previewToken } : {}),
        tag: `entry:${tenantSlug}:page:${slug}`,
      }
    );

  try {
    return await fetchOnce(true);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') return null;
    // Expired / revoked / wrong-tenant preview tokens — fall back to the
    // published-only path so the user still sees the live page rather than
    // an opaque server error.
    if (code === 'UNAUTHORIZED' && options.previewToken) {
      try {
        return await fetchOnce(false);
      } catch (innerErr) {
        const innerCode = (innerErr as { code?: string }).code;
        if (innerCode === 'NOT_FOUND') return null;
        throw innerErr;
      }
    }
    throw err;
  }
}
