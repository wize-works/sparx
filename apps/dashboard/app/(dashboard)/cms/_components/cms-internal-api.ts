// Thin client-side helpers around the dashboard's internal CMS routes.
//
// Browser code can't call api-rest directly (the CMS bearer JWT lives on
// the server only), so we expose a couple of cookie-authed Next.js route
// handlers that proxy to api-rest. The form pickers + asset library use
// these.

interface ApiEntryRow {
  id: string;
  type_key: string;
  slug: string | null;
  status: string;
  body: { title?: string; name?: string } & Record<string, unknown>;
  updated_at: string;
}

interface ApiEntryResponse {
  success: true;
  data: ApiEntryRow[];
}

interface ApiError {
  success: false;
  error: { code: string; message: string };
}

export interface SearchEntryParams {
  q?: string;
  typeKey?: string;
  limit?: number;
}

export interface SearchEntryResult {
  id: string;
  typeKey: string;
  slug: string | null;
  status: string;
  title: string;
}

function deriveTitle(row: ApiEntryRow): string {
  if (typeof row.body.title === 'string' && row.body.title) return row.body.title;
  if (typeof row.body.name === 'string' && row.body.name) return row.body.name;
  return row.slug ?? row.id;
}

export async function searchEntries(params: SearchEntryParams): Promise<SearchEntryResult[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.typeKey) qs.set('type', params.typeKey);
  qs.set('limit', String(params.limit ?? 20));
  const res = await fetch(`/api/internal/cms/entries?${qs.toString()}`, {
    credentials: 'include',
  });
  const body = (await res.json()) as ApiEntryResponse | ApiError;
  if (!('success' in body) || !body.success) {
    throw new Error(('error' in body && body.error?.message) || 'Failed to search entries.');
  }
  return body.data.map((row) => ({
    id: row.id,
    typeKey: row.type_key,
    slug: row.slug,
    status: row.status,
    title: deriveTitle(row),
  }));
}
