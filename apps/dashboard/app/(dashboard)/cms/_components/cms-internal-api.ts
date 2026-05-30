// Thin client-side helper around the CMS reference-picker Server Action.
//
// `searchEntries` is consumed by reference-picker.tsx and field-renderer.tsx
// (both client components). It delegates to `searchEntriesAction` so the
// same `SearchEntryResult` row shape stays stable for the callers, while
// the transport sheds the former `/api/internal/cms/entries` Next.js route.

import { searchEntriesAction } from './cms-actions';

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

function deriveTitle(row: {
  id: string;
  slug: string | null;
  body: Record<string, unknown>;
}): string {
  const title = row.body.title;
  if (typeof title === 'string' && title) return title;
  const name = row.body.name;
  if (typeof name === 'string' && name) return name;
  return row.slug ?? row.id;
}

export async function searchEntries(params: SearchEntryParams): Promise<SearchEntryResult[]> {
  const result = await searchEntriesAction({
    q: params.q,
    typeKey: params.typeKey,
    limit: params.limit ?? 20,
  });
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data.map((row) => ({
    id: row.id,
    typeKey: row.type_key,
    slug: row.slug,
    status: row.status,
    title: deriveTitle(row),
  }));
}
