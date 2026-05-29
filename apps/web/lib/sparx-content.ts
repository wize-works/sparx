// Server-side client for apps/web reading from the Sparx CMS via api-rest's
// public surface. No auth required — `/v1/public/*` endpoints are scoped by
// tenant slug and return only `status='published'` rows.
//
// Used by the marketing module pages once the CMS migration completes.
// Lives next to the legacy `lib/modules.ts` so we can switch a single route
// over and validate before removing the hard-coded TS.

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';
const TENANT_SLUG = process.env.SPARX_MARKETING_TENANT_SLUG ?? 'sparx-marketing';

interface ApiEntry<T = Record<string, unknown>> {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: T;
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
  options: { previewToken?: string } = {}
): Promise<T> {
  const qs = new URLSearchParams({
    tenant: TENANT_SLUG,
    ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
    ...(options.previewToken ? { preview: options.previewToken } : {}),
  });
  const res = await fetch(`${BASE_URL}${path}?${qs.toString()}`, {
    // Preview requests bypass the CDN cache — they're scoped to one
    // editor staring at one draft entry, not the publicly-cached page.
    // Published reads keep the 5-minute revalidate window invalidated by
    // the publish webhook via `revalidateTag('sparx-cms')`.
    next: options.previewToken ? { revalidate: 0 } : { revalidate: 300, tags: ['sparx-cms'] },
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

// Marketing module body shape — mirror of @sparx/cms-schemas built-in
// `module` schema. Kept here as a hand-rolled TS interface so apps/web
// doesn't take a dep on @sparx/cms-schemas (it would otherwise drag the
// validator into the browser bundle).

export interface ModuleFeatureBody {
  number: string;
  title: string;
  body: string;
}

export interface ModulePricing {
  price: string;
  period: string;
  modifier: 'standalone' | 'additive';
  bundleNote: string;
}

export interface ModuleBody {
  label: string;
  moduleKey: string;
  headlinePrimary: string;
  headlineSecondary: string;
  title: string;
  description: string;
  lede: string;
  features: string[]; // feature entry ids
  pricing: ModulePricing;
  marketingDomain?: string;
}

export interface FetchedModule {
  meta: ModuleBody;
  features: ModuleFeatureBody[];
  slug: string;
  publishedAt: string | null;
}

export async function listModules(): Promise<{ slug: string; meta: ModuleBody }[]> {
  const entries = await publicGet<ApiEntry<ModuleBody>[]>(`/v1/public/content/entries`, {
    type: 'module',
    limit: 50,
  });
  return entries
    .filter((e): e is ApiEntry<ModuleBody> & { slug: string } => Boolean(e.slug))
    .map((e) => ({ slug: e.slug, meta: e.body }));
}

// FAQ items — non-routable. Sorted client-side by `order` so the seed and
// dashboard can reorder without an explicit API sort param.

export interface FaqItemBody {
  question: string;
  // TipTap doc — flattened to plain text via flattenTipTap below. Anything
  // richer joins by paragraph. The marketing FAQ component renders plain
  // text; the dashboard editor handles authoring with full block fidelity.
  answer: {
    type: string;
    content?: { type: string; content?: { type: string; text?: string }[] }[];
  };
  category?: string;
  order?: number;
}

export interface FetchedFaqItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
  order: number;
}

function flattenTipTap(doc: FaqItemBody['answer']): string {
  if (!doc?.content) return '';
  return doc.content
    .map((node) => (node.content ?? []).map((leaf) => leaf.text ?? '').join(''))
    .filter((line) => line.length)
    .join('\n\n');
}

export async function listFaqItems(): Promise<FetchedFaqItem[]> {
  const entries = await publicGet<ApiEntry<FaqItemBody>[]>(`/v1/public/content/entries`, {
    type: 'faq_item',
    limit: 100,
  });
  return entries
    .map((e) => ({
      id: e.id,
      question: e.body.question,
      answer: flattenTipTap(e.body.answer),
      ...(e.body.category ? { category: e.body.category } : {}),
      order: typeof e.body.order === 'number' ? e.body.order : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order);
}

export async function getModule(
  slug: string,
  options: { previewToken?: string } = {}
): Promise<FetchedModule | null> {
  let entry: ApiEntry<ModuleBody>;
  try {
    entry = await publicGet<ApiEntry<ModuleBody>>(
      '/v1/public/content/entries/by-slug',
      { type: 'module', slug },
      options
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'NOT_FOUND') return null;
    throw err;
  }

  // Fetch the feature references in one parallel batch. The api-rest
  // /v1/public/content/entries endpoint doesn't yet take an `ids` filter —
  // when entries grow large enough that the per-id round-trips become
  // expensive we can add one. For 6-12 features per module, parallel
  // single-id fetches against an in-cluster service are cheap.
  const features = await Promise.all(
    entry.body.features.map(async (id) => {
      try {
        // Feature references aren't preview-token scoped — the token only
        // unlocks the module entry it was issued for, so we fetch each
        // feature as a normal published lookup.
        const feature = await publicGet<ApiEntry<ModuleFeatureBody>>(
          `/v1/public/content/entries/${id}`,
          {}
        );
        return feature.body;
      } catch {
        return null;
      }
    })
  );

  return {
    meta: entry.body,
    features: features.filter((f): f is ModuleFeatureBody => f !== null),
    slug: entry.slug ?? slug,
    publishedAt: entry.published_at,
  };
}
