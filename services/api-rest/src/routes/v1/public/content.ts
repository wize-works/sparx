// Public read endpoints for headless storefronts and the marketing site.
//
//   GET /v1/public/content/entries          ?tenant=<slug>&type=<key>[&limit=&cursor=]
//   GET /v1/public/content/entries/by-slug  ?tenant=<slug>&type=<key>&slug=<>
//   GET /v1/public/content/types/:key       ?tenant=<slug>
//
// No auth required: results are restricted to `status='published'` and
// `deleted_at IS NULL`. Tenant resolution is by SLUG (tenants table is the
// only non-RLS row, safe to look up), then RLS-scoped reads with that
// tenant's id via `withTenant`.
//
// Preview tokens (Phase 2.6) layer on top: when the request carries
// `Authorization: Preview <jwt>` and the jwt validates + names the same
// entry being requested, the draft is served instead. That's wired in
// services/api-rest/src/lib/preview.ts (see also the dashboard's "Copy
// preview URL" button on each entry).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, withTenant } from '@sparx/db';
import { ok, paged } from '../../../lib/envelope.js';
import { notFound, badRequest } from '../../../errors.js';
import { serializeEntry } from '../../../lib/entries.js';

const ListQuery = z.object({
    tenant: z.string().min(1).max(63),
    type: z.string().min(1).max(63),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(250).default(50),
});

const BySlugQuery = z.object({
    tenant: z.string().min(1).max(63),
    type: z.string().min(1).max(63),
    slug: z.string().min(1).max(255),
});

const TypeKeyParams = z.object({ key: z.string().min(1).max(63) });
const TypeKeyQuery = z.object({ tenant: z.string().min(1).max(63) });

const ByIdParams = z.object({ id: z.string().uuid() });
const ByIdQuery = z.object({ tenant: z.string().min(1).max(63) });

async function resolveTenantBySlug(slug: string): Promise<string> {
    const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!t) throw notFound('Tenant', slug);
    return t.id;
}

const publicContentRoutes: FastifyPluginAsync = (app) => {
    app.get('/v1/public/content/entries', async (request) => {
        const q = ListQuery.parse(request.query);
        const tenantId = await resolveTenantBySlug(q.tenant);
        const rows = await withTenant({ tenantId }, (tx) =>
            tx.contentEntry.findMany({
                where: { typeKey: q.type, status: 'published', deletedAt: null },
                orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
                take: q.limit + 1,
                ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
            })
        );
        const hasMore = rows.length > q.limit;
        const page = hasMore ? rows.slice(0, q.limit) : rows;
        const next = hasMore ? (page[page.length - 1]?.id ?? null) : null;
        return paged(page.map(serializeEntry), { per_page: q.limit, next_cursor: next });
    });

    app.get('/v1/public/content/entries/by-slug', async (request) => {
        const q = BySlugQuery.parse(request.query);
        const tenantId = await resolveTenantBySlug(q.tenant);
        const row = await withTenant({ tenantId }, (tx) =>
            tx.contentEntry.findFirst({
                where: { typeKey: q.type, slug: q.slug, status: 'published', deletedAt: null },
            })
        );
        if (!row) throw notFound(`${q.type}`, q.slug);
        return ok(serializeEntry(row));
    });

    // Public lookup by id — used for `reference` field resolution where a
    // non-routable type (feature, faq_item) has slug=null and can't be fetched
    // via /by-slug.
    app.get('/v1/public/content/entries/:id', async (request) => {
        const { id } = ByIdParams.parse(request.params);
        const q = ByIdQuery.parse(request.query);
        const tenantId = await resolveTenantBySlug(q.tenant);
        const row = await withTenant({ tenantId }, (tx) =>
            tx.contentEntry.findFirst({
                where: { id, status: 'published', deletedAt: null },
            })
        );
        if (!row) throw notFound('Entry', id);
        return ok(serializeEntry(row));
    });

    app.get('/v1/public/content/types/:key', async (request) => {
        const { key } = TypeKeyParams.parse(request.params);
        const q = TypeKeyQuery.parse(request.query);
        const tenantId = await resolveTenantBySlug(q.tenant);
        const row = await withTenant({ tenantId }, (tx) =>
            tx.contentType.findFirst({
                where: { key },
                orderBy: [{ isBuiltIn: 'asc' }, { updatedAt: 'desc' }],
            })
        );
        if (!row) throw notFound('Content type', key);
        return ok(row);
    });

    // Trivial readiness probe for downstream caches (Cloudflare etc.) — checks
    // the tenant exists. Cheap and CDN-friendly.
    app.get('/v1/public/tenants/:slug', async (request) => {
        const params = z.object({ slug: z.string().min(1).max(63) }).parse(request.params);
        const tenant = await prisma.tenant.findUnique({
            where: { slug: params.slug },
            select: { id: true, slug: true, name: true, settings: true },
        });
        if (!tenant) throw notFound('Tenant', params.slug);
        if (tenant.id === '00000000-0000-0000-0000-000000000000') {
            throw badRequest('Reserved tenant.');
        }
        return ok({
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            settings: tenant.settings,
        });
    });
    return Promise.resolve();
};

export default publicContentRoutes;
