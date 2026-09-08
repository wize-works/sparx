// Content entry service — the shared write path for entries (docs/12).
//
// The REST routes and the MCP tools both drive entry mutations through these
// functions, so the create / update / publish / unpublish logic (type
// resolution, body validation, slug uniqueness, revisions, reference rebuild,
// status transitions) lives in ONE place. Each write has a `*Tx` core (runs in a
// caller-supplied transaction) and a tx-opening wrapper for callers with no
// ambient tx (the MCP tools). Reads open their own tenant-scoped tx.

import type { ContentEntry, Prisma, TxClient } from '@wizeworks/db';
import { withTenant } from '@wizeworks/db';
import { conflict, notFound } from '@wizeworks/api-core/errors';
import { slugify, uniqueSlug } from '@wizeworks/api-core/slug';
import { resolveType, parseTypeSchema, validateAndNormalizeBody } from './content-types.js';
import { serializeEntry, recordRevision, syncReferences, type WireEntry } from './entries.js';
import type { CmsWriteContext, CmsEmittedEvent } from './service-support.js';

type Json = Prisma.InputJsonValue;

export type EntryStatus = 'draft' | 'scheduled' | 'published' | 'archived';

/** The publish-date invariant: a row that says `published` MUST carry a
 *  `published_at`, because everything downstream reads the DATE and not the
 *  status. The public listing orders by `publishedAt desc` — and Postgres sorts
 *  NULLs FIRST on a descending order, so a dateless post outranks every real one
 *  a shop ever writes; the storefront's card binds a pre-formatted `date` and
 *  renders an empty line when there isn't one. Both failures are silent, and the
 *  console shows the same green **Published** either way (issue 376).
 *
 *  `existing` keeps a row's original publish date when a write is only touching
 *  its status or body — the date a post went live is a fact about the post, not
 *  about the last edit. Pass nothing on a create. The deliberate re-dating on an
 *  explicit publish action stays in `publishEntryTx`, which is a person choosing
 *  to publish rather than a write that happens to carry a status.
 *
 *  The database enforces the same rule (`content_entries_published_has_date`), so
 *  a future write path that forgets this fails loudly instead of quietly
 *  shipping an undated post. */
export function publishTimestamp(
  status: string,
  existing?: Date | null,
  now: Date = new Date()
): Date | null {
  if (status !== 'published') return existing ?? null;
  return existing ?? now;
}

export interface CreateEntryInput {
  typeKey: string;
  slug?: string;
  status?: EntryStatus;
  body?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  authorId?: string | null;
  localeCode?: string | null;
  /** Resolved Model-B site scope (docs/49 §3). `undefined` / `[]` → all sites;
   *  the REST route resolves its header-based default before calling. */
  propertyIds?: string[];
}

export interface UpdateEntryInput {
  slug?: string;
  body?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  authorId?: string | null;
  localeCode?: string | null;
  /** Full-replacement site scope. `undefined` → unchanged; `[]` → all sites. */
  propertyIds?: string[];
}

export interface PublishEntryInput {
  /** ISO-8601. A future instant schedules; past/absent publishes now. */
  scheduledAt?: string | null;
}

export interface EntryWriteResult {
  entry: ContentEntry;
  events: CmsEmittedEvent[];
}

// ── CREATE ────────────────────────────────────────────────────────────────────

export async function createEntryTx(
  tx: TxClient,
  ctx: CmsWriteContext,
  input: CreateEntryInput
): Promise<EntryWriteResult> {
  const type = await resolveType(tx, input.typeKey);
  const schema = parseTypeSchema(type);
  const body = validateAndNormalizeBody(schema, input.body ?? {});
  const seo = input.seo ?? {};

  // Slug: an explicit slug is honoured verbatim (collision → 409); a derived
  // slug (from body.title) is auto-uniquified so the title-only happy path
  // never collides.
  const candidateBase = input.slug ? slugify(input.slug) : slugify((body.title as string) ?? '');
  let slug: string | null = null;
  if (type.urlPattern) {
    if (!candidateBase) throw conflict('A slug is required for routable content types.');
    if (input.slug) {
      const collision = await tx.contentEntry.findFirst({
        where: { typeKey: type.key, slug: candidateBase, deletedAt: null },
        select: { id: true },
      });
      if (collision) {
        throw conflict(`A ${type.name.toLowerCase()} with slug "${candidateBase}" already exists.`);
      }
      slug = candidateBase;
    } else {
      slug = await uniqueSlug(candidateBase, async (s) => {
        const collision = await tx.contentEntry.findFirst({
          where: { typeKey: type.key, slug: s, deletedAt: null },
          select: { id: true },
        });
        return collision !== null;
      });
    }
  } else if (input.slug) {
    slug = slugify(input.slug);
  }

  const status = input.status ?? 'draft';
  const entry = await tx.contentEntry.create({
    data: {
      tenantId: ctx.tenantId,
      typeKey: type.key,
      slug,
      status,
      // Mirrors the publish transition below (nextStatus === 'published' → now)
      // — a status set directly at create time needs the same real timestamp,
      // not a null that public listing's `orderBy publishedAt desc` and any
      // "published on" display would otherwise mishandle.
      publishedAt: publishTimestamp(status),
      body: body as Json,
      seoJson: seo as Json,
      authorId: input.authorId ?? null,
      localeCode: input.localeCode ?? null,
    },
  });

  if (input.propertyIds && input.propertyIds.length > 0) {
    await tx.contentEntryProperty.createMany({
      data: input.propertyIds.map((propertyId) => ({ propertyId, entryId: entry.id })),
    });
  }

  await syncReferences(tx, ctx.tenantId, entry.id, schema, body);
  await recordRevision(tx, {
    tenantId: ctx.tenantId,
    entryId: entry.id,
    body,
    seoJson: seo,
    status: entry.status,
    kind: 'manual',
    authorId: ctx.actorId,
    summary: 'Initial revision',
  });

  return {
    entry,
    events: [
      {
        type: 'content.entry.created',
        data: { entryId: entry.id, typeKey: entry.typeKey, slug: entry.slug, status: entry.status },
      },
    ],
  };
}

/** tx-opening wrapper for callers with no ambient transaction (MCP). */
export async function createEntry(
  ctx: CmsWriteContext,
  input: CreateEntryInput
): Promise<{ entry: WireEntry; events: CmsEmittedEvent[] }> {
  const { entry, events } = await withTenant({ tenantId: ctx.tenantId }, (tx) =>
    createEntryTx(tx, ctx, input)
  );
  return { entry: serializeEntry(entry), events };
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

export async function updateEntryTx(
  tx: TxClient,
  ctx: CmsWriteContext,
  id: string,
  input: UpdateEntryInput
): Promise<EntryWriteResult> {
  const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound('Entry', id);

  const type = await resolveType(tx, existing.typeKey);
  const schema = parseTypeSchema(type);

  const nextBody =
    input.body !== undefined
      ? validateAndNormalizeBody(schema, input.body)
      : ((existing.body ?? {}) as Record<string, unknown>);
  const nextSeo = input.seo ?? ((existing.seoJson ?? {}) as Record<string, unknown>);

  let nextSlug = existing.slug;
  if (input.slug !== undefined && type.urlPattern) {
    const candidate = slugify(input.slug);
    if (candidate !== existing.slug) {
      const collision = await tx.contentEntry.findFirst({
        where: { typeKey: type.key, slug: candidate, NOT: { id }, deletedAt: null },
        select: { id: true },
      });
      if (collision) throw conflict(`Slug "${candidate}" is already in use.`);
      nextSlug = candidate;
    }
  }

  const entry = await tx.contentEntry.update({
    where: { id },
    data: {
      slug: nextSlug,
      body: nextBody as Json,
      seoJson: nextSeo as Json,
      authorId: input.authorId === undefined ? existing.authorId : input.authorId,
      localeCode: input.localeCode === undefined ? existing.localeCode : input.localeCode,
      updatedAt: new Date(),
    },
  });

  if (input.propertyIds !== undefined) {
    await tx.contentEntryProperty.deleteMany({ where: { entryId: entry.id } });
    if (input.propertyIds.length > 0) {
      await tx.contentEntryProperty.createMany({
        data: input.propertyIds.map((propertyId) => ({ propertyId, entryId: entry.id })),
      });
    }
  }

  await syncReferences(tx, ctx.tenantId, entry.id, schema, nextBody);
  await recordRevision(tx, {
    tenantId: ctx.tenantId,
    entryId: entry.id,
    body: nextBody,
    seoJson: nextSeo,
    status: entry.status,
    kind: 'autosave',
    authorId: ctx.actorId,
  });

  return {
    entry,
    events: [
      { type: 'content.entry.updated', data: { entryId: entry.id, typeKey: entry.typeKey } },
    ],
  };
}

export async function updateEntry(
  ctx: CmsWriteContext,
  id: string,
  input: UpdateEntryInput
): Promise<{ entry: WireEntry; events: CmsEmittedEvent[] }> {
  const { entry, events } = await withTenant({ tenantId: ctx.tenantId }, (tx) =>
    updateEntryTx(tx, ctx, id, input)
  );
  return { entry: serializeEntry(entry), events };
}

// ── PUBLISH / UNPUBLISH ─────────────────────────────────────────────────────────

export async function publishEntryTx(
  tx: TxClient,
  ctx: CmsWriteContext,
  id: string,
  input: PublishEntryInput,
  now: Date
): Promise<EntryWriteResult> {
  const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound('Entry', id);
  if (existing.status === 'published' && !input.scheduledAt) {
    throw conflict('Entry is already published.');
  }

  const scheduled = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const nextStatus: EntryStatus = scheduled && scheduled > now ? 'scheduled' : 'published';

  const entry = await tx.contentEntry.update({
    where: { id },
    data: {
      status: nextStatus,
      scheduledAt: nextStatus === 'scheduled' ? scheduled : null,
      // Keep the prior publish time when scheduling.
      publishedAt: nextStatus === 'published' ? now : existing.publishedAt,
      archivedAt: null,
    },
  });

  await recordRevision(tx, {
    tenantId: ctx.tenantId,
    entryId: entry.id,
    body: (entry.body ?? {}) as Record<string, unknown>,
    seoJson: (entry.seoJson ?? {}) as Record<string, unknown>,
    status: entry.status,
    kind: 'manual',
    authorId: ctx.actorId,
    summary:
      nextStatus === 'scheduled' ? `Scheduled for ${scheduled?.toISOString() ?? ''}` : 'Published',
  });

  return {
    entry,
    events: [
      {
        type: nextStatus === 'scheduled' ? 'content.entry.scheduled' : 'content.entry.published',
        data: {
          entryId: entry.id,
          typeKey: entry.typeKey,
          slug: entry.slug,
          scheduledAt: entry.scheduledAt?.toISOString() ?? null,
        },
      },
    ],
  };
}

export async function publishEntry(
  ctx: CmsWriteContext,
  id: string,
  input: PublishEntryInput,
  now: Date
): Promise<{ entry: WireEntry; events: CmsEmittedEvent[] }> {
  const { entry, events } = await withTenant({ tenantId: ctx.tenantId }, (tx) =>
    publishEntryTx(tx, ctx, id, input, now)
  );
  return { entry: serializeEntry(entry), events };
}

export async function unpublishEntryTx(
  tx: TxClient,
  ctx: CmsWriteContext,
  id: string
): Promise<EntryWriteResult> {
  const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound('Entry', id);
  // Already a draft — nothing to do; no revision, no event.
  if (existing.status === 'draft') return { entry: existing, events: [] };

  const entry = await tx.contentEntry.update({
    where: { id },
    data: { status: 'draft', scheduledAt: null },
  });
  await recordRevision(tx, {
    tenantId: ctx.tenantId,
    entryId: entry.id,
    body: (entry.body ?? {}) as Record<string, unknown>,
    seoJson: (entry.seoJson ?? {}) as Record<string, unknown>,
    status: 'draft',
    kind: 'manual',
    authorId: ctx.actorId,
    summary: 'Unpublished',
  });

  return {
    entry,
    events: [
      { type: 'content.entry.unpublished', data: { entryId: entry.id, typeKey: entry.typeKey } },
    ],
  };
}

export async function unpublishEntry(
  ctx: CmsWriteContext,
  id: string
): Promise<{ entry: WireEntry; events: CmsEmittedEvent[] }> {
  const { entry, events } = await withTenant({ tenantId: ctx.tenantId }, (tx) =>
    unpublishEntryTx(tx, ctx, id)
  );
  return { entry: serializeEntry(entry), events };
}

// ── DELETE ──────────────────────────────────────────────────────────────────────

export async function deleteEntryTx(
  tx: TxClient,
  _ctx: CmsWriteContext,
  id: string
): Promise<EntryWriteResult> {
  const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound('Entry', id);

  // Soft-delete — the row survives for audit/history; reads filter deletedAt.
  const entry = await tx.contentEntry.update({ where: { id }, data: { deletedAt: new Date() } });

  return {
    entry,
    events: [{ type: 'content.entry.deleted', data: { entryId: id } }],
  };
}

export async function deleteEntry(
  ctx: CmsWriteContext,
  id: string
): Promise<{ entry: WireEntry; events: CmsEmittedEvent[] }> {
  const { entry, events } = await withTenant({ tenantId: ctx.tenantId }, (tx) =>
    deleteEntryTx(tx, ctx, id)
  );
  return { entry: serializeEntry(entry), events };
}

// ── RESTORE REVISION ─────────────────────────────────────────────────────────
// Restore an entry's body + SEO from an older revision. This does NOT roll the
// status back — it re-writes the current draft/published body from the snapshot
// and records a NEW revision summarising the restore (so history stays append-
// only). No Pub/Sub event: it's an in-place edit, same as a manual body update.

export async function restoreRevisionTx(
  tx: TxClient,
  ctx: CmsWriteContext,
  id: string,
  revisionNumber: number
): Promise<EntryWriteResult> {
  const entry = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
  if (!entry) throw notFound('Entry', id);

  const target = await tx.contentRevision.findFirst({ where: { entryId: id, revisionNumber } });
  if (!target) throw notFound('Revision', `${id}#${revisionNumber}`);

  const type = await resolveType(tx, entry.typeKey);
  const schema = parseTypeSchema(type);

  const body = (target.body ?? {}) as Record<string, unknown>;
  const seoJson = (target.seoJson ?? {}) as Record<string, unknown>;

  const after = await tx.contentEntry.update({
    where: { id },
    data: { body: body as Json, seoJson: seoJson as Json, updatedAt: new Date() },
  });
  await syncReferences(tx, ctx.tenantId, after.id, schema, body);
  await recordRevision(tx, {
    tenantId: ctx.tenantId,
    entryId: after.id,
    body,
    seoJson,
    status: after.status,
    kind: 'manual',
    authorId: ctx.actorId,
    summary: `Restored from revision #${revisionNumber}`,
  });

  return { entry: after, events: [] };
}

export async function restoreRevision(
  ctx: CmsWriteContext,
  id: string,
  revisionNumber: number
): Promise<{ entry: WireEntry; events: CmsEmittedEvent[] }> {
  const { entry, events } = await withTenant({ tenantId: ctx.tenantId }, (tx) =>
    restoreRevisionTx(tx, ctx, id, revisionNumber)
  );
  return { entry: serializeEntry(entry), events };
}

// ── READS ──────────────────────────────────────────────────────────────────────

export interface ListEntriesFilter {
  typeKey?: string;
  status?: EntryStatus;
  slug?: string;
  q?: string;
  authorId?: string;
  localeCode?: string;
  take?: number;
  skip?: number;
}

export interface EntryListPage {
  entries: WireEntry[];
  total: number;
}

export async function listEntries(
  tenantId: string,
  filter: ListEntriesFilter
): Promise<EntryListPage> {
  const where: Prisma.ContentEntryWhereInput = {
    deletedAt: null,
    ...(filter.typeKey ? { typeKey: filter.typeKey } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.slug ? { slug: filter.slug } : {}),
    ...(filter.authorId ? { authorId: filter.authorId } : {}),
    ...(filter.localeCode ? { localeCode: filter.localeCode } : {}),
    ...(filter.q
      ? {
          OR: [
            { slug: { contains: filter.q, mode: 'insensitive' } },
            { body: { path: ['title'], string_contains: filter.q } },
          ],
        }
      : {}),
  };
  const take = Math.min(filter.take ?? 50, 250);
  const [rows, total] = await withTenant({ tenantId }, (tx) =>
    Promise.all([
      tx.contentEntry.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take,
        skip: filter.skip ?? 0,
      }),
      tx.contentEntry.count({ where }),
    ])
  );
  return { entries: rows.map(serializeEntry), total };
}

export interface EntryDetail extends WireEntry {
  propertyIds: string[];
}

export async function getEntry(tenantId: string, id: string): Promise<EntryDetail | null> {
  const row = await withTenant({ tenantId }, (tx) =>
    tx.contentEntry.findFirst({
      where: { id, deletedAt: null },
      include: { propertyLinks: { select: { propertyId: true } } },
    })
  );
  if (!row) return null;
  return { ...serializeEntry(row), propertyIds: row.propertyLinks.map((l) => l.propertyId) };
}
