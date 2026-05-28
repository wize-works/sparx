// CMS surface — content types, entries, revisions, publish, preview tokens.
//
// Every method returns `{ data, meta }` from the underlying client so callers
// have access to ETag / request_id for optimistic concurrency + tracing.

import type { SparxClient } from './client.js';
import type {
  ContentEntry,
  ContentEntryListItem,
  ContentRevision,
  ContentTypeMeta,
  PageMeta,
  EntryStatus,
} from './types.js';

export interface ListEntriesQuery {
  type?: string;
  status?: EntryStatus;
  slug?: string;
  q?: string;
  author?: string;
  locale?: string;
  updatedAfter?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateEntryInput {
  type_key: string;
  slug?: string;
  status?: EntryStatus;
  body?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  author_id?: string;
  locale_code?: string;
}

export interface UpdateEntryInput {
  slug?: string;
  body?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  author_id?: string | null;
  locale_code?: string | null;
}

export interface PublishEntryInput {
  scheduledAt?: string;
}

export interface PreviewTokenResponse {
  token: string;
  expiresAt: string;
}

export class CmsApi {
  constructor(private readonly client: SparxClient) {}

  // ── content types ──────────────────────────────────────────────────────

  listTypes() {
    return this.client.request<ContentTypeMeta[]>({ path: '/v1/content/types' });
  }

  getType(key: string) {
    return this.client.request<ContentTypeMeta>({
      path: `/v1/content/types/${encodeURIComponent(key)}`,
    });
  }

  // ── entries ────────────────────────────────────────────────────────────

  listEntries(q: ListEntriesQuery = {}) {
    return this.client.request<ContentEntryListItem[]>({
      path: '/v1/content/entries',
      query: {
        type: q.type,
        status: q.status,
        slug: q.slug,
        q: q.q,
        author: q.author,
        locale: q.locale,
        updated_after: q.updatedAfter,
        cursor: q.cursor,
        limit: q.limit,
      },
    }) as Promise<{ data: ContentEntryListItem[]; meta: PageMeta & { status: number } }>;
  }

  getEntry(id: string) {
    return this.client.request<ContentEntry>({ path: `/v1/content/entries/${id}` });
  }

  createEntry(input: CreateEntryInput, opts: { idempotencyKey?: string } = {}) {
    return this.client.request<ContentEntry>({
      method: 'POST',
      path: '/v1/content/entries',
      body: input,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  updateEntry(id: string, input: UpdateEntryInput, opts: { ifMatch?: string } = {}) {
    return this.client.request<ContentEntry>({
      method: 'PATCH',
      path: `/v1/content/entries/${id}`,
      body: input,
      ifMatch: opts.ifMatch,
    });
  }

  deleteEntry(id: string) {
    return this.client.request<undefined>({
      method: 'DELETE',
      path: `/v1/content/entries/${id}`,
    });
  }

  // ── publish ────────────────────────────────────────────────────────────

  publishEntry(id: string, input: PublishEntryInput = {}) {
    return this.client.request<ContentEntry>({
      method: 'POST',
      path: `/v1/content/entries/${id}/publish`,
      body: input,
    });
  }

  unpublishEntry(id: string) {
    return this.client.request<ContentEntry>({
      method: 'POST',
      path: `/v1/content/entries/${id}/unpublish`,
    });
  }

  // ── revisions ──────────────────────────────────────────────────────────

  listRevisions(entryId: string) {
    return this.client.request<ContentRevision[]>({
      path: `/v1/content/entries/${entryId}/revisions`,
    });
  }

  getRevision(entryId: string, revisionNumber: number) {
    return this.client.request<ContentRevision & { body: Record<string, unknown> }>({
      path: `/v1/content/entries/${entryId}/revisions/${revisionNumber}`,
    });
  }

  restoreRevision(entryId: string, revisionNumber: number) {
    return this.client.request<ContentEntry>({
      method: 'POST',
      path: `/v1/content/entries/${entryId}/revisions/${revisionNumber}/restore`,
    });
  }

  // ── preview tokens ─────────────────────────────────────────────────────

  mintPreviewToken(entryId: string) {
    return this.client.request<PreviewTokenResponse>({
      method: 'POST',
      path: `/v1/content/entries/${entryId}/preview-tokens`,
    });
  }

  // ── public reads (no auth, or preview-token-scoped) ────────────────────

  /**
   * Public read of a published entry by slug. Pass `preview: true` to use
   * the configured preview token (the client's `previewToken` option),
   * which permits reading the draft of *that one entry*.
   */
  getEntryBySlug(typeKey: string, slug: string, opts: { preview?: boolean } = {}) {
    return this.client.request<ContentEntry>({
      path: `/v1/public/content/${encodeURIComponent(typeKey)}/by-slug/${encodeURIComponent(slug)}`,
      preview: opts.preview,
    });
  }
}
