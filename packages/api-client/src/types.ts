// Public API response shapes.
//
// These mirror the JSON the api-rest service returns for content + media +
// navigation routes. They are *intentionally* hand-curated rather than
// generated from OpenAPI for two reasons:
//
//   1. The api-rest endpoints are still adding tags + descriptions; the
//      generated spec would be incomplete for several months.
//   2. Hand-curating lets us expose a smaller, more opinionated surface to
//      external consumers without leaking implementation churn.
//
// When the OpenAPI spec stabilizes, switch consumers to `src/openapi.d.ts`
// (regenerated via `pnpm gen`) — at that point the shapes here become the
// "stable" public types and the generated ones are the "everything" types.

export type EntryStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface ContentEntry {
  id: string;
  typeKey: string;
  slug: string | null;
  status: EntryStatus;
  body: Record<string, unknown>;
  seo: ContentEntrySeo;
  authorId: string | null;
  localeCode: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentEntrySeo {
  title?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  ogImage?: string;
  jsonLdOverride?: unknown;
}

export interface ContentEntryListItem {
  id: string;
  typeKey: string;
  slug: string | null;
  status: EntryStatus;
  publishedAt: string | null;
  updatedAt: string;
}

export interface ContentRevision {
  id: string;
  entryId: string;
  revisionNumber: number;
  status: EntryStatus;
  authorId: string | null;
  summary: string | null;
  kind: 'autosave' | 'manual';
  createdAt: string;
}

export interface ContentTypeMeta {
  id: string;
  key: string;
  name: string;
  plural_name: string;
  description: string | null;
  icon: string | null;
  url_pattern: string | null;
  is_built_in: boolean;
  is_singleton: boolean;
  schema_json: { fields: unknown[] };
  created_at: string;
  updated_at: string;
}

export interface MediaAsset {
  id: string;
  key: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  dominantColor: string | null;
  focalPointX: number | null;
  focalPointY: number | null;
  altText: string | null;
  caption: string | null;
  status: 'uploading' | 'ready' | 'failed';
  usageCount: number;
  variants: MediaVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface MediaVariant {
  id: string;
  format: string;
  width: number;
  height: number;
  byteSize: number;
  key: string;
  url: string;
}

export interface NavigationMenu {
  id: string;
  location: string;
  items: NavigationItem[];
}

export interface NavigationItem {
  id: string;
  label: string;
  entryId: string | null;
  externalUrl: string | null;
  children?: NavigationItem[];
}

export interface Redirect {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
  hitCount: number;
  createdAt: string;
}

export interface PageMeta {
  cursor?: string | null;
  nextCursor?: string | null;
  perPage?: number;
}
