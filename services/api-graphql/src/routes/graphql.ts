// GraphQL endpoint at /v1/graphql.
//
// Mirrors the REST surface for content reads and the common content
// mutations. Same auth model (internal-trust JWT verified by
// @sparx/api-core/auth), same tenant scoping (withRequestTenant). SDL is
// hand-written rather than generated via Pothos — keeps the dependency
// surface small, and our type set is narrow enough that a single SDL string
// is easier to grep than a half-dozen builder calls.
//
// Resolvers are intentionally thin wrappers around the same service /
// repository helpers the REST routes use (everything imported here lives
// in @sparx/api-core), so the two surfaces can't drift.

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import mercurius, { type MercuriusContext } from 'mercurius';

// Tell mercurius's IResolvers what shape our context factory returns. Without
// this augmentation the resolver signatures don't satisfy IFieldResolver
// (which is typed against MercuriusContext).
declare module 'mercurius' {
  interface MercuriusContext {
    request: FastifyRequest;
  }
}
import type { ContentEntry, Prisma } from '@sparx/db';
import { withRequestTenant } from '@sparx/api-core/db';
import { requireAuth, requireRole } from '@sparx/api-core/auth';
import {
  parseTypeSchema,
  resolveType,
  validateAndNormalizeBody,
} from '@sparx/api-core/content-types';
import { recordRevision, serializeEntry, syncReferences } from '@sparx/api-core/entries';
import { writeAudit } from '@sparx/api-core/audit';
import { publish } from '@sparx/api-core/pubsub';
import { slugify, uniqueSlug } from '@sparx/api-core/slug';
import { computeEntryEtag, assertIfMatch } from '@sparx/api-core/etag';
import { conflict, notFound } from '@sparx/api-core/errors';
import { crmResolvers, crmSdl } from './crm/index.js';

type Json = Prisma.InputJsonValue;

// ─── SDL ──────────────────────────────────────────────────────────────────

const sdl = /* GraphQL */ `
  scalar JSON
  scalar DateTime

  enum EntryStatus {
    draft
    scheduled
    published
    archived
  }

  type ContentType {
    key: String!
    name: String!
    pluralName: String!
    urlPattern: String
    isBuiltIn: Boolean!
    isSingleton: Boolean!
    schema: JSON!
  }

  type Entry {
    id: ID!
    typeKey: String!
    slug: String
    status: EntryStatus!
    body: JSON!
    seo: JSON!
    authorId: ID
    localeCode: String
    publishedAt: DateTime
    scheduledAt: DateTime
    archivedAt: DateTime
    createdAt: DateTime!
    updatedAt: DateTime!
    etag: String!
  }

  type Revision {
    revisionNumber: Int!
    kind: String!
    status: EntryStatus!
    summary: String
    authorId: ID
    createdAt: DateTime!
  }

  type EntryList {
    items: [Entry!]!
    nextCursor: ID
  }

  input EntriesFilter {
    type: String
    status: EntryStatus
    slug: String
    q: String
    author: ID
    locale: String
    updatedAfter: DateTime
    cursor: ID
    limit: Int
  }

  input CreateEntryInput {
    typeKey: String!
    slug: String
    status: EntryStatus
    body: JSON
    seo: JSON
    authorId: ID
    localeCode: String
  }

  input UpdateEntryInput {
    slug: String
    body: JSON
    seo: JSON
    authorId: ID
    localeCode: String
  }

  type Query {
    contentTypes: [ContentType!]!
    contentType(key: String!): ContentType
    entries(filter: EntriesFilter): EntryList!
    entry(id: ID!): Entry
    entryBySlug(typeKey: String!, slug: String!): Entry
    revisions(entryId: ID!): [Revision!]!
  }

  type Mutation {
    createEntry(input: CreateEntryInput!): Entry!
    updateEntry(id: ID!, input: UpdateEntryInput!, ifMatch: String): Entry!
    publishEntry(id: ID!, scheduledAt: DateTime): Entry!
    unpublishEntry(id: ID!): Entry!
    deleteEntry(id: ID!): Boolean!
  }
`;

// ─── helpers ──────────────────────────────────────────────────────────────

function toEntryGql(row: ContentEntry): Record<string, unknown> {
  const wire = serializeEntry(row);
  return {
    id: row.id,
    typeKey: wire.type_key,
    slug: wire.slug,
    status: wire.status,
    body: wire.body,
    seo: wire.seo,
    authorId: wire.author_id,
    localeCode: wire.locale_code,
    publishedAt: wire.published_at,
    scheduledAt: wire.scheduled_at,
    archivedAt: wire.archived_at,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
    etag: computeEntryEtag(row),
  };
}

type GqlContext = MercuriusContext;

// ─── resolvers ────────────────────────────────────────────────────────────

const resolvers = {
  Query: {
    contentTypes: async (_p: unknown, _args: unknown, ctx: GqlContext) => {
      requireRole(ctx.request, 'viewer');
      const rows = await withRequestTenant(ctx.request, (tx) =>
        tx.contentType.findMany({ orderBy: [{ name: 'asc' }] })
      );
      return rows.map((r) => ({
        key: r.key,
        name: r.name,
        pluralName: r.pluralName,
        urlPattern: r.urlPattern,
        isBuiltIn: r.isBuiltIn,
        isSingleton: r.isSingleton,
        schema: r.schemaJson,
      }));
    },

    contentType: async (_p: unknown, args: { key: string }, ctx: GqlContext) => {
      requireRole(ctx.request, 'viewer');
      const row = await withRequestTenant(ctx.request, (tx) => resolveType(tx, args.key));
      return {
        key: row.key,
        name: row.name,
        pluralName: row.pluralName,
        urlPattern: row.urlPattern,
        isBuiltIn: row.isBuiltIn,
        isSingleton: row.isSingleton,
        schema: row.schemaJson,
      };
    },

    entries: async (
      _p: unknown,
      args: {
        filter?: {
          type?: string;
          status?: 'draft' | 'scheduled' | 'published' | 'archived';
          slug?: string;
          q?: string;
          author?: string;
          locale?: string;
          updatedAfter?: string;
          cursor?: string;
          limit?: number;
        };
      },
      ctx: GqlContext
    ) => {
      requireRole(ctx.request, 'viewer');
      const f = args.filter ?? {};
      const limit = Math.min(Math.max(f.limit ?? 50, 1), 250);
      const where: Prisma.ContentEntryWhereInput = {
        deletedAt: null,
        ...(f.type ? { typeKey: f.type } : {}),
        ...(f.status ? { status: f.status } : {}),
        ...(f.slug ? { slug: f.slug } : {}),
        ...(f.author ? { authorId: f.author } : {}),
        ...(f.locale ? { localeCode: f.locale } : {}),
        ...(f.updatedAfter ? { updatedAt: { gt: new Date(f.updatedAfter) } } : {}),
        ...(f.q
          ? {
              OR: [
                { slug: { contains: f.q, mode: 'insensitive' as const } },
                { body: { path: ['title'], string_contains: f.q } },
              ],
            }
          : {}),
      };
      const rows = await withRequestTenant(ctx.request, (tx) =>
        tx.contentEntry.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
        })
      );
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;
      return { items: page.map(toEntryGql), nextCursor };
    },

    entry: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
      requireRole(ctx.request, 'viewer');
      const row = await withRequestTenant(ctx.request, (tx) =>
        tx.contentEntry.findFirst({ where: { id: args.id, deletedAt: null } })
      );
      return row ? toEntryGql(row) : null;
    },

    entryBySlug: async (_p: unknown, args: { typeKey: string; slug: string }, ctx: GqlContext) => {
      requireRole(ctx.request, 'viewer');
      const row = await withRequestTenant(ctx.request, (tx) =>
        tx.contentEntry.findFirst({
          where: { typeKey: args.typeKey, slug: args.slug, deletedAt: null },
        })
      );
      return row ? toEntryGql(row) : null;
    },

    revisions: async (_p: unknown, args: { entryId: string }, ctx: GqlContext) => {
      requireRole(ctx.request, 'viewer');
      const rows = await withRequestTenant(ctx.request, (tx) =>
        tx.contentRevision.findMany({
          where: { entryId: args.entryId },
          orderBy: [{ revisionNumber: 'desc' }],
          take: 100,
        })
      );
      return rows.map((r) => ({
        revisionNumber: r.revisionNumber,
        kind: r.kind,
        status: r.status,
        summary: r.summary,
        authorId: r.authorId,
        createdAt: r.createdAt.toISOString(),
      }));
    },
  },

  Mutation: {
    createEntry: async (
      _p: unknown,
      args: {
        input: {
          typeKey: string;
          slug?: string;
          status?: 'draft' | 'scheduled' | 'published' | 'archived';
          body?: Record<string, unknown>;
          seo?: Record<string, unknown>;
          authorId?: string;
          localeCode?: string;
        };
      },
      ctx: GqlContext
    ) => {
      const auth = requireRole(ctx.request, 'editor');
      const input = args.input;

      const created = await withRequestTenant(ctx.request, async (tx) => {
        const type = await resolveType(tx, input.typeKey);
        const schema = parseTypeSchema(type);
        const body = validateAndNormalizeBody(schema, input.body ?? {});
        const seo = input.seo ?? {};

        const candidateBase = input.slug
          ? slugify(input.slug)
          : slugify((body.title as string) ?? '');
        let slug: string | null = null;
        if (type.urlPattern) {
          if (!candidateBase) {
            throw conflict('A slug is required for routable content types.');
          }
          if (input.slug) {
            const collision = await tx.contentEntry.findFirst({
              where: { typeKey: type.key, slug: candidateBase, deletedAt: null },
              select: { id: true },
            });
            if (collision) {
              throw conflict(`Slug "${candidateBase}" already exists.`);
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

        const entry = await tx.contentEntry.create({
          data: {
            tenantId: auth.tenantId,
            typeKey: type.key,
            slug,
            status: input.status ?? 'draft',
            body: body as Json,
            seoJson: seo as Json,
            authorId: input.authorId ?? null,
            localeCode: input.localeCode ?? null,
          },
        });

        await syncReferences(tx, auth.tenantId, entry.id, schema, body);
        await recordRevision(tx, {
          tenantId: auth.tenantId,
          entryId: entry.id,
          body,
          seoJson: seo,
          status: entry.status,
          kind: 'manual',
          authorId: auth.actorId,
          summary: 'Initial revision (graphql)',
        });
        await writeAudit(tx, ctx.request, auth, {
          action: 'content.entry.created',
          entityType: 'content_entry',
          entityId: entry.id,
          after: { typeKey: entry.typeKey, slug: entry.slug, status: entry.status },
        });

        return entry;
      });

      await publish(ctx.request.log, 'content.entry.created', auth.tenantId, auth.actorId, {
        entryId: created.id,
        typeKey: created.typeKey,
        slug: created.slug,
        status: created.status,
      });

      return toEntryGql(created);
    },

    updateEntry: async (
      _p: unknown,
      args: {
        id: string;
        input: {
          slug?: string;
          body?: Record<string, unknown>;
          seo?: Record<string, unknown>;
          authorId?: string | null;
          localeCode?: string | null;
        };
        ifMatch?: string;
      },
      ctx: GqlContext
    ) => {
      const auth = requireRole(ctx.request, 'editor');

      const updated = await withRequestTenant(ctx.request, async (tx) => {
        const existing = await tx.contentEntry.findFirst({
          where: { id: args.id, deletedAt: null },
        });
        if (!existing) throw notFound('Entry', args.id);

        assertIfMatch(args.ifMatch ?? undefined, computeEntryEtag(existing));

        const type = await resolveType(tx, existing.typeKey);
        const schema = parseTypeSchema(type);

        const nextBody =
          args.input.body !== undefined
            ? validateAndNormalizeBody(schema, args.input.body)
            : ((existing.body ?? {}) as Record<string, unknown>);
        const nextSeo =
          args.input.seo !== undefined
            ? (args.input.seo ?? {})
            : ((existing.seoJson ?? {}) as Record<string, unknown>);

        let nextSlug = existing.slug;
        if (args.input.slug !== undefined && type.urlPattern) {
          const candidate = slugify(args.input.slug);
          if (candidate !== existing.slug) {
            const collision = await tx.contentEntry.findFirst({
              where: {
                typeKey: type.key,
                slug: candidate,
                NOT: { id: args.id },
                deletedAt: null,
              },
              select: { id: true },
            });
            if (collision) throw conflict(`Slug "${candidate}" is already in use.`);
            nextSlug = candidate;
          }
        }

        const after = await tx.contentEntry.update({
          where: { id: args.id },
          data: {
            slug: nextSlug,
            body: nextBody as Json,
            seoJson: nextSeo as Json,
            authorId: args.input.authorId === undefined ? existing.authorId : args.input.authorId,
            localeCode:
              args.input.localeCode === undefined ? existing.localeCode : args.input.localeCode,
            updatedAt: new Date(),
          },
        });

        await syncReferences(tx, auth.tenantId, after.id, schema, nextBody);
        await recordRevision(tx, {
          tenantId: auth.tenantId,
          entryId: after.id,
          body: nextBody,
          seoJson: nextSeo,
          status: after.status,
          kind: 'autosave',
          authorId: auth.actorId,
        });
        await writeAudit(tx, ctx.request, auth, {
          action: 'content.entry.updated',
          entityType: 'content_entry',
          entityId: after.id,
          before: { slug: existing.slug, status: existing.status },
          after: { slug: after.slug, status: after.status },
        });

        return after;
      });

      await publish(ctx.request.log, 'content.entry.updated', auth.tenantId, auth.actorId, {
        entryId: updated.id,
        typeKey: updated.typeKey,
      });

      return toEntryGql(updated);
    },

    publishEntry: async (
      _p: unknown,
      args: { id: string; scheduledAt?: string },
      ctx: GqlContext
    ) => {
      const auth = requireRole(ctx.request, 'editor');
      const updated = await withRequestTenant(ctx.request, async (tx) => {
        const existing = await tx.contentEntry.findFirst({
          where: { id: args.id, deletedAt: null },
        });
        if (!existing) throw notFound('Entry', args.id);
        const isScheduled = args.scheduledAt && new Date(args.scheduledAt).getTime() > Date.now();
        const after = await tx.contentEntry.update({
          where: { id: args.id },
          data: isScheduled
            ? { status: 'scheduled', scheduledAt: new Date(args.scheduledAt!) }
            : { status: 'published', publishedAt: new Date(), scheduledAt: null },
        });
        await writeAudit(tx, ctx.request, auth, {
          action: isScheduled ? 'content.entry.scheduled' : 'content.entry.published',
          entityType: 'content_entry',
          entityId: after.id,
          before: { status: existing.status },
          after: {
            status: after.status,
            publishedAt: after.publishedAt?.toISOString() ?? null,
            scheduledAt: after.scheduledAt?.toISOString() ?? null,
          },
        });
        return { after, isScheduled: !!isScheduled };
      });

      await publish(
        ctx.request.log,
        updated.isScheduled ? 'content.entry.scheduled' : 'content.entry.published',
        auth.tenantId,
        auth.actorId,
        {
          entryId: updated.after.id,
          typeKey: updated.after.typeKey,
          slug: updated.after.slug,
        }
      );

      return toEntryGql(updated.after);
    },

    unpublishEntry: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
      const auth = requireRole(ctx.request, 'editor');
      const updated = await withRequestTenant(ctx.request, async (tx) => {
        const existing = await tx.contentEntry.findFirst({
          where: { id: args.id, deletedAt: null },
        });
        if (!existing) throw notFound('Entry', args.id);
        const after = await tx.contentEntry.update({
          where: { id: args.id },
          data: { status: 'draft', publishedAt: null, scheduledAt: null },
        });
        await writeAudit(tx, ctx.request, auth, {
          action: 'content.entry.unpublished',
          entityType: 'content_entry',
          entityId: after.id,
          before: { status: existing.status },
          after: { status: after.status },
        });
        return after;
      });

      await publish(ctx.request.log, 'content.entry.unpublished', auth.tenantId, auth.actorId, {
        entryId: updated.id,
        typeKey: updated.typeKey,
      });

      return toEntryGql(updated);
    },

    deleteEntry: async (_p: unknown, args: { id: string }, ctx: GqlContext) => {
      const auth = requireRole(ctx.request, 'editor');
      await withRequestTenant(ctx.request, async (tx) => {
        const existing = await tx.contentEntry.findFirst({
          where: { id: args.id, deletedAt: null },
        });
        if (!existing) throw notFound('Entry', args.id);
        await tx.contentEntry.update({ where: { id: args.id }, data: { deletedAt: new Date() } });
        await writeAudit(tx, ctx.request, auth, {
          action: 'content.entry.deleted',
          entityType: 'content_entry',
          entityId: args.id,
          before: { slug: existing.slug, status: existing.status },
        });
      });

      await publish(ctx.request.log, 'content.entry.deleted', auth.tenantId, auth.actorId, {
        entryId: args.id,
      });

      return true;
    },
  },
};

// ─── plugin ───────────────────────────────────────────────────────────────

const graphqlRoutes: FastifyPluginAsync = async (app) => {
  await app.register(mercurius, {
    // CMS SDL declares scalars + root Query/Mutation types; CRM SDL extends
    // the same Query/Mutation via `extend type` so a single mercurius
    // instance serves both surfaces (locked decision #7).
    schema: sdl + crmSdl,
    resolvers: {
      Query: { ...resolvers.Query, ...crmResolvers.Query },
      Mutation: { ...resolvers.Mutation, ...crmResolvers.Mutation },
    },
    path: '/v1/graphql',
    // GraphiQL UI in dev only — production exposes the endpoint without
    // the playground so we don't ship a "make any query" surface
    // unauthenticated.
    graphiql: process.env.NODE_ENV !== 'production',
    // Mercurius automatically passes the Fastify request into context as
    // `reply.request`; the buildContext below normalizes it so resolvers
    // can read `ctx.request`. requireAuth on the request runs there.
    context: (request: FastifyRequest) => ({ request }),
  });

  // Force auth check for all GraphQL POSTs. Has to be a preHandler — the
  // auth plugin populates request.auth in its own preHandler, and onRequest
  // hooks fire before preHandler, so onRequest here would always see auth=null.
  // GET (introspection) stays exempt so GraphiQL works in dev.
  app.addHook('preHandler', (request, _reply, done) => {
    if (request.url.startsWith('/v1/graphql') && request.method !== 'GET') {
      requireAuth(request);
    }
    done();
  });
};

export default graphqlRoutes;
