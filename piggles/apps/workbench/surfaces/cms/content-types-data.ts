'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE CONTENT-TYPE DATA LAYER
//
// Content types are the SCHEMA behind everything in the Content editor: a type's
// `schema_json.fields` is exactly what surfaces/cms/schema-form.tsx renders a
// form from. So this module and that one share one vocabulary of field types —
// the `FieldDef` union declared in ./data (a mirror of @wizeworks/cms-schemas, which
// validates every schema server-side). This file NEVER invents a field type or a
// config the editor cannot render; it authors the same shape the editor consumes.
//
// The wire is snake_case (see serializeContentType in @wizeworks/cms). We keep those
// names verbatim — `ContentType` here is that exact shape, re-used from ./data.
//
// Writing note: the create route (POST) takes the whole schema in one body under
// the key `schema`; editing an existing type is TWO calls — PATCH the meta, PUT
// the field schema — which is what `useSaveContentType` sequences. Built-in types
// are platform-owned and read-only: the surface never PATCHes/PUTs/DELETEs one.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { api } from '../../lib/api/client';
// Read-only imports: the wire shape, the field vocabulary the editor renders, and
// the shared content key tree — so a type change here also refreshes the Content
// editor's "kind" picker, which reads contentKeys.types().
import { contentKeys, type ContentType, type FieldDef } from './data';

export type { ContentType, FieldDef } from './data';
// The draft model and its wire conversion moved out under the size rule. Re-exported
// so every caller keeps ONE import for the type editor's vocabulary.
export {
  FIELD_TYPES,
  blankField,
  toFieldKey,
  toTypeKey,
  validateFields,
  type DraftField,
  type EnumOption,
  type FieldType,
} from './content-type-fields';
export { fromDraftFields, toDraftFields } from './content-type-field-wire';

/* ── The query-key tree ─────────────────────────────────────────────────── */

export const contentTypeKeys = {
  all: ['cms', 'content-types'] as const,
  list: () => [...contentTypeKeys.all, 'list'] as const,
  detail: (key: string) => [...contentTypeKeys.all, 'detail', key] as const,
  counts: () => [...contentTypeKeys.all, 'counts'] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

/** Every content type — built-ins plus this business's own. A small, bounded set
 *  (built-ins plus a handful of custom types), so the whole list loads at once and
 *  the surface searches/filters it in the browser. */
export function useContentTypeList() {
  return useQuery({
    queryKey: contentTypeKeys.list(),
    queryFn: () => api.list<ContentType>('/v1/content/types', { take: 250 }).then((r) => r.items),
  });
}

export function useContentType(key: string) {
  return useQuery({
    queryKey: contentTypeKeys.detail(key),
    queryFn: () => api.get<ContentType>(`/v1/content/types/${key}`),
    enabled: key !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

interface SummaryResponse {
  byType: {
    typeKey: string;
    name: string;
    count: number;
    publishedCount: number;
    allSitesCount: number;
  }[];
}

/**
 * How many entries use each type — TWO numbers, because two screens ask two
 * different questions of the same relation.
 *
 * `here` is what is on the site being worked in, which is what the "entries"
 * column means; `allSites` is what the type holds across the whole business,
 * which is what a delete has to reckon with (the server refuses tenant-wide, so
 * a type with nothing on this site can still be undeletable). Serving only the
 * first would put "0 entries use this type" above a Delete the server then
 * refuses — issue 389, and the same trap as 385 pointing the other way.
 */
export interface EntryCounts {
  here: number;
  allSites: number;
}

/** A live aggregate from the CMS reports endpoint; a missing key means zero.
 *  Bounded and slow-changing, so it is cached for a minute. */
export function useEntryCountsByType() {
  return useQuery({
    queryKey: contentTypeKeys.counts(),
    queryFn: () => api.get<SummaryResponse>('/v1/content/reports/summary'),
    staleTime: 60_000,
    select: (data) => {
      const map = new Map<string, EntryCounts>();
      for (const row of data.byType) {
        map.set(row.typeKey, { here: row.count, allSites: row.allSitesCount });
      }
      return map;
    },
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

function useInvalidateTypes() {
  const queryClient = useQueryClient();
  return (key?: string) => {
    void queryClient.invalidateQueries({ queryKey: contentTypeKeys.list() });
    void queryClient.invalidateQueries({ queryKey: contentTypeKeys.counts() });
    // The Content editor's "kind" picker reads the shared content key tree — keep
    // it in step so a newly-defined type is writable immediately.
    void queryClient.invalidateQueries({ queryKey: contentKeys.types() });
    if (key) void queryClient.invalidateQueries({ queryKey: contentTypeKeys.detail(key) });
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

/** The type's meta, wire-shaped. `null` clears an optional; `undefined` leaves it. */
export interface TypeMetaInput {
  name: string;
  plural_name: string;
  description?: string | null;
  icon?: string | null;
  url_pattern?: string | null;
  is_singleton?: boolean;
}

export interface CreateTypeInput extends TypeMetaInput {
  key: string;
  schema: { fields: FieldDef[] };
}

export function useCreateContentType() {
  const invalidate = useInvalidateTypes();
  return useMutation({
    mutationFn: (input: CreateTypeInput) => api.post<ContentType>('/v1/content/types', input),
    onSuccess: (type) => {
      invalidate(type.key);
    },
  });
}

/** Save an existing CUSTOM type: PATCH the meta, then PUT the field schema. Two
 *  calls because the schema has its own authoring route (the docs/51 keystone);
 *  sequenced so a schema rejection can't leave the meta half-written the other
 *  way round. Returns the type as the schema route serialises it. */
export function useSaveContentType(key: string) {
  const invalidate = useInvalidateTypes();
  return useMutation({
    mutationFn: async (input: { meta: TypeMetaInput; schema: { fields: FieldDef[] } }) => {
      await api.patch<ContentType>(`/v1/content/types/${key}`, input.meta);
      return api.put<ContentType>(`/v1/content/types/${key}/schema`, { schema: input.schema });
    },
    onSuccess: () => {
      invalidate(key);
    },
  });
}

export function useDeleteContentType(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/v1/content/types/${key}`),
    onSuccess: () => {
      // Only the list + counts are refreshed — the detail query is left to
      // garbage-collect when the pane unmounts, so a refetch of the just-deleted
      // key can't 404 into this pane mid-close (see useDeleteEntry in ./data).
      void queryClient.invalidateQueries({ queryKey: contentTypeKeys.list() });
      void queryClient.invalidateQueries({ queryKey: contentTypeKeys.counts() });
      void queryClient.invalidateQueries({ queryKey: contentKeys.types() });
    },
  });
}
