// Pages and posts.
//
// The entity nobody else moves. Every competitor's importer takes a product
// catalogue; almost none take a decade of writing, which is why "we'll rebuild the
// blog later" is the sentence that quietly kills a migration. A catalogue can be
// re-keyed in an afternoon; 400 posts cannot.
//
// Two decisions carry the weight here:
//
//   The content TYPE is created if it does not exist. A tenant who has never opened
//   the CMS has no `post` type, and telling them to go and define one — with fields,
//   before they have seen a single imported article — is asking them to design a
//   schema for content they already wrote. Two types are created on demand, with the
//   fields the imported body actually fills.
//
//   Published stays published, drafts stay drafts. An import that publishes
//   everything puts a tenant's unfinished writing on the open web, and an import that
//   drafts everything makes their live site look empty on migration day. Both are
//   irreversible-feeling to the person watching it happen, so the file's own status
//   is honoured exactly.

import { withTenant } from '@wizeworks/db';
import {
  createContentType,
  createEntry,
  listContentTypes,
  publishEntry,
  updateEntry,
} from '@wizeworks/cms';
import { toIsoDate, toSlug } from '@wizeworks/migration';

import {
  eachRow,
  type EntityProcessor,
  type ImportRow,
  type PreviewResult,
  type RowResult,
} from './types';

type EntryKind = 'post' | 'page';

/** Keys we will adopt if the tenant already has a type that means this. Ordered by
 *  how likely the tenant meant it — an existing `article` type is a better home for
 *  an imported post than a freshly minted `post` type sitting beside it. */
const EXISTING_KEYS: Record<EntryKind, string[]> = {
  post: ['post', 'blog_post', 'blogPost', 'article', 'news', 'blog'],
  page: ['page', 'static_page', 'landing_page'],
};

const SCHEMA_FOR: Record<EntryKind, { key: string; label: string; type: string }[]> = {
  post: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'body', label: 'Body', type: 'rich_text' },
    { key: 'excerpt', label: 'Excerpt', type: 'long_text' },
    { key: 'featuredImage', label: 'Featured image', type: 'url' },
    { key: 'author', label: 'Author', type: 'text' },
    { key: 'categories', label: 'Categories', type: 'text' },
    { key: 'tags', label: 'Tags', type: 'text' },
  ],
  page: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'body', label: 'Body', type: 'rich_text' },
    { key: 'excerpt', label: 'Summary', type: 'long_text' },
  ],
};

async function resolveTypeKey(
  tenantId: string,
  actorId: string | null,
  kind: EntryKind,
  cache: Map<EntryKind, string>
): Promise<string> {
  const cached = cache.get(kind);
  if (cached !== undefined) return cached;

  const existing = await listContentTypes(tenantId);
  const match = existing.find((type) =>
    EXISTING_KEYS[kind].some((key) => key.toLowerCase() === type.key.toLowerCase())
  );
  if (match !== undefined) {
    cache.set(kind, match.key);
    return match.key;
  }

  const created = await createContentType(
    { tenantId, actorId },
    {
      key: kind,
      name: kind === 'post' ? 'Post' : 'Page',
      pluralName: kind === 'post' ? 'Posts' : 'Pages',
      description:
        kind === 'post'
          ? 'Articles and blog posts, brought over from your previous platform.'
          : 'Standalone pages, brought over from your previous platform.',
      urlPattern: kind === 'post' ? '/blog/{slug}' : '/{slug}',
      schema: { fields: SCHEMA_FOR[kind] } as never,
    }
  );
  cache.set(kind, created.contentType.key);
  return created.contentType.key;
}

function kindOf(row: ImportRow): EntryKind {
  return (row.type ?? '').trim().toLowerCase() === 'page' ? 'page' : 'post';
}

function slugOf(row: ImportRow): string {
  const explicit = (row.slug ?? '').trim();
  return explicit !== '' ? toSlug(explicit) : toSlug(row.title ?? '');
}

function bodyOf(row: ImportRow): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: (row.title ?? '').trim(),
    body: row.body ?? '',
  };
  if ((row.excerpt ?? '') !== '') body.excerpt = row.excerpt;
  if ((row.featured_image_url ?? '') !== '') body.featuredImage = row.featured_image_url;
  if ((row.author ?? '') !== '') body.author = row.author;
  if ((row.categories ?? '') !== '') body.categories = row.categories;
  if ((row.tags ?? '') !== '') body.tags = row.tags;
  // Anything the vendor adapter carried through as a tenant's own field. Webflow and
  // Framer collections are mostly these, so dropping them would drop the collection.
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith('custom:') || value === undefined || value === '') continue;
    body[key.slice('custom:'.length)] = value;
  }
  return body;
}

export const contentProcessor: EntityProcessor = {
  entity: 'content',
  module: 'cms',

  async run(ctx, rows, options, logger) {
    const typeCache = new Map<EntryKind, string>();
    const actorId = ctx.userId ?? null;
    const propertyIds = ctx.propertyId == null ? undefined : [ctx.propertyId];

    return eachRow<RowResult>(
      rows,
      logger,
      async (row, rowIndex) => {
        const title = (row.title ?? '').trim();
        const slug = slugOf(row);
        if (title === '') {
          return { rowIndex, status: 'error', errorMsg: 'This row has no title.' };
        }
        if (slug === '') {
          return {
            rowIndex,
            status: 'error',
            naturalKey: title,
            errorMsg: 'Could not work out a web address for this page from its title.',
          };
        }

        const kind = kindOf(row);
        const typeKey = await resolveTypeKey(ctx.tenantId, actorId, kind, typeCache);

        const existing = await withTenant(ctx, (tx) =>
          tx.contentEntry.findFirst({
            where: { tenantId: ctx.tenantId, slug, deletedAt: null },
            select: { id: true, status: true },
          })
        );

        const seo: Record<string, unknown> = {};
        if ((row.seo_title ?? '') !== '') seo.title = row.seo_title;
        if ((row.seo_description ?? '') !== '') seo.description = row.seo_description;

        if (existing !== null && !options.upsert) {
          return { rowIndex, status: 'skipped', naturalKey: slug };
        }

        const status = ((row.status ?? 'draft').trim().toLowerCase() || 'draft') as
          'draft' | 'published' | 'scheduled' | 'archived';

        if (existing !== null) {
          await updateEntry({ tenantId: ctx.tenantId, actorId }, existing.id, {
            body: bodyOf(row),
            ...(Object.keys(seo).length > 0 ? { seo } : {}),
            ...(propertyIds !== undefined ? { propertyIds } : {}),
          });
          return { rowIndex, status: 'updated', naturalKey: slug };
        }

        const { entry } = await createEntry(
          { tenantId: ctx.tenantId, actorId },
          {
            typeKey,
            slug,
            status: status === 'published' || status === 'scheduled' ? 'draft' : status,
            body: bodyOf(row),
            ...(Object.keys(seo).length > 0 ? { seo } : {}),
            ...(propertyIds !== undefined ? { propertyIds } : {}),
          }
        );

        // Publishing is a separate call because it stamps `publishedAt` and emits the
        // event the search index and any live site listen for. Creating the entry
        // already-published would leave both out of step with it.
        if (status === 'published') {
          const publishedAt = toIsoDate(row.published_at);
          await publishEntry(
            { tenantId: ctx.tenantId, actorId },
            entry.id,
            // The file's own date, so an article written in 2019 keeps its date rather
            // than claiming to be published on migration day and reordering the blog.
            { scheduledAt: publishedAt ?? null },
            new Date()
          );
        }

        return { rowIndex, status: 'imported', naturalKey: slug };
      },
      (rowIndex, message) => ({ rowIndex, status: 'error', errorMsg: message })
    );
  },

  async preview(ctx, rows, logger) {
    const existingTypes = await listContentTypes(ctx.tenantId);
    const missingTypes = new Set<EntryKind>();
    for (const kind of ['post', 'page'] as EntryKind[]) {
      const found = existingTypes.some((type) =>
        EXISTING_KEYS[kind].some((key) => key.toLowerCase() === type.key.toLowerCase())
      );
      if (!found) missingTypes.add(kind);
    }

    return eachRow<PreviewResult>(
      rows,
      logger,
      async (row, rowIndex) => {
        const slug = slugOf(row);
        if ((row.title ?? '').trim() === '')
          return { rowIndex, action: 'error', errorMsg: 'No title.' };
        if (slug === '') return { rowIndex, action: 'error', errorMsg: 'No usable web address.' };

        const existing = await withTenant(ctx, (tx) =>
          tx.contentEntry.findFirst({
            where: { tenantId: ctx.tenantId, slug, deletedAt: null },
            select: { id: true },
          })
        );

        const kind = kindOf(row);
        return {
          rowIndex,
          action: existing === null ? 'create' : 'update',
          naturalKey: slug,
          ...(missingTypes.has(kind)
            ? {
                errorMsg: `Will create a “${kind === 'post' ? 'Post' : 'Page'}” content type first.`,
              }
            : {}),
        };
      },
      (rowIndex, message) => ({ rowIndex, action: 'error', errorMsg: message })
    );
  },
};
