// Entry serializer + shared write path.
//
// `serializeEntry` is the canonical wire shape returned by GET/POST/PATCH.
// Both wire-out and audit "after" use the same shape so audit diffs are
// directly readable. The write path (`writeEntry`) creates a revision +
// rebuilds references in the same transaction every save — this is the
// only place autosave / publish / restore should touch a content entry.

import type { ContentEntry, ContentRevision, Prisma, TxClient } from '@sparx/db';
import type { ContentTypeSchema } from '@sparx/cms-schemas';
import { rebuildReferences } from './references.js';

type Json = Prisma.InputJsonValue;

export interface WireEntry {
  id: string;
  type_key: string;
  slug: string | null;
  status: ContentEntry['status'];
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
  published_at: string | null;
  scheduled_at: string | null;
  archived_at: string | null;
  author_id: string | null;
  locale_code: string | null;
  parent_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeEntry(row: ContentEntry): WireEntry {
  return {
    id: row.id,
    type_key: row.typeKey,
    slug: row.slug,
    status: row.status,
    body: (row.body ?? {}) as Record<string, unknown>,
    seo: (row.seoJson ?? {}) as Record<string, unknown>,
    published_at: row.publishedAt?.toISOString() ?? null,
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    archived_at: row.archivedAt?.toISOString() ?? null,
    author_id: row.authorId,
    locale_code: row.localeCode,
    parent_entry_id: row.parentEntryId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export interface WireRevision {
  revision_number: number;
  kind: ContentRevision['kind'];
  status: ContentRevision['status'];
  summary: string | null;
  author_id: string | null;
  created_at: string;
}

export function serializeRevisionMeta(row: ContentRevision): WireRevision {
  return {
    revision_number: row.revisionNumber,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    author_id: row.authorId,
    created_at: row.createdAt.toISOString(),
  };
}

export interface WireRevisionFull extends WireRevision {
  body: Record<string, unknown>;
  seo: Record<string, unknown>;
}

export function serializeRevisionFull(row: ContentRevision): WireRevisionFull {
  return {
    ...serializeRevisionMeta(row),
    body: (row.body ?? {}) as Record<string, unknown>,
    seo: (row.seoJson ?? {}) as Record<string, unknown>,
  };
}

// Records a new revision row for an entry. Revision numbers are dense and
// monotonic per entry — we compute the next one via a max() lookup inside
// the same transaction, which the (entry_id, revision_number) UNIQUE keeps
// honest under concurrent writes (a colliding INSERT fails with P2002, the
// caller's PATCH retries once).

export async function recordRevision(
  tx: TxClient,
  args: {
    tenantId: string;
    entryId: string;
    body: Record<string, unknown>;
    seoJson: Record<string, unknown>;
    status: string;
    kind: 'autosave' | 'manual';
    authorId: string | null;
    summary?: string;
  }
): Promise<ContentRevision> {
  const last = await tx.contentRevision.findFirst({
    where: { entryId: args.entryId },
    orderBy: { revisionNumber: 'desc' },
    select: { revisionNumber: true },
  });
  const next = (last?.revisionNumber ?? 0) + 1;
  return tx.contentRevision.create({
    data: {
      tenantId: args.tenantId,
      entryId: args.entryId,
      revisionNumber: next,
      kind: args.kind,
      body: args.body as Json,
      seoJson: args.seoJson as Json,
      status: args.status,
      authorId: args.authorId,
      summary: args.summary ?? null,
    },
  });
}

// Helper for the create / update path — rebuild the reference edge list
// against the type's schema so usage tracking + broken-link detection stay
// consistent with whatever the body looks like now.

export async function syncReferences(
  tx: TxClient,
  tenantId: string,
  entryId: string,
  schema: ContentTypeSchema,
  body: Record<string, unknown>
): Promise<void> {
  await rebuildReferences(tx, tenantId, entryId, schema, body);
}
