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
import { ok, paged } from '@sparx/api-core/envelope';
import { notFound, badRequest } from '@sparx/api-core/errors';
import { serializeEntry } from '@sparx/api-core/entries';
import { tryVerifyPreviewToken } from '../../../lib/preview.js';

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
    const preview = await tryVerifyPreviewToken(app, request);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.contentEntry.findFirst({
        where: {
          typeKey: q.type,
          slug: q.slug,
          deletedAt: null,
          // Preview token grants draft access only for the entry it's
          // scoped to. For any other entry the default published-only
          // filter applies.
          ...(preview
            ? { OR: [{ status: 'published' }, { id: preview.entryId }] }
            : { status: 'published' }),
        },
      })
    );
    if (!row) throw notFound(`${q.type}`, q.slug);
    return ok(serializeEntry(row));
  });

  // Public lookup by id — used for `reference` field resolution where a
  // non-routable type (feature, faq_item) has slug=null and can't be fetched
  // via /by-slug. Honors preview tokens the same way.
  app.get('/v1/public/content/entries/:id', async (request) => {
    const { id } = ByIdParams.parse(request.params);
    const q = ByIdQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const preview = await tryVerifyPreviewToken(app, request);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.contentEntry.findFirst({
        where: {
          id,
          deletedAt: null,
          ...(preview?.entryId === id ? {} : { status: 'published' }),
        },
      })
    );
    if (!row) throw notFound('Entry', id);
    return ok(serializeEntry(row));
  });

  // Public navigation menu read — the storefront layout resolves a header/footer
  // SiteLayoutBlock's `navigationMenuId` into renderable links. Items are
  // resolved to an href: an internal CMS page (entryId → published page slug)
  // or an external URL. Unpublished / missing entries are dropped so the
  // storefront never renders a dead link. Tree-shaped via parentItemId.
  app.get('/v1/public/content/navigation/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const q = z.object({ tenant: z.string().min(1).max(63) }).parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);

    const menu = await withTenant({ tenantId }, (tx) =>
      tx.navigationMenu.findUnique({
        where: { id },
        select: {
          id: true,
          location: true,
          name: true,
          items: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              parentItemId: true,
              position: true,
              label: true,
              externalUrl: true,
              openInNewTab: true,
              // Only published, non-deleted target pages resolve to a link.
              entry: { select: { slug: true, status: true, deletedAt: true } },
            },
          },
        },
      })
    );
    if (!menu) throw notFound('Navigation menu', id);

    interface NavNode {
      id: string;
      label: string;
      href: string;
      openInNewTab: boolean;
      children: NavNode[];
    }
    const hrefFor = (item: (typeof menu.items)[number]): string | null => {
      if (item.externalUrl) return item.externalUrl;
      const e = item.entry;
      if (e?.slug && e.status === 'published' && !e.deletedAt) return `/${e.slug}`;
      return null;
    };

    // Build the tree, dropping items with no resolvable href (and, with them,
    // any descendants — a child of a dead parent has no place to hang).
    const byParent = new Map<string | null, typeof menu.items>();
    for (const item of menu.items) {
      const key = item.parentItemId;
      const bucket = byParent.get(key) ?? [];
      bucket.push(item);
      byParent.set(key, bucket);
    }
    const build = (parentId: string | null): NavNode[] =>
      (byParent.get(parentId) ?? []).flatMap((item) => {
        const href = hrefFor(item);
        if (!href) return [];
        return [
          {
            id: item.id,
            label: item.label,
            href,
            openInNewTab: item.openInNewTab,
            children: build(item.id),
          },
        ];
      });

    return ok({ id: menu.id, location: menu.location, name: menu.name, items: build(null) });
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

    // Storefront theme + commerce defaults travel with the tenant payload so
    // the storefront's root layout resolves everything in a single fetch.
    // Both rows are one-per-tenant (tenantId PK); a missing row means the
    // merchant hasn't customized, so we fall back to nulls/defaults that the
    // storefront's token layer interprets as "use the default theme".
    const [theme, storefront] = await withTenant({ tenantId: tenant.id }, (tx) =>
      Promise.all([
        tx.storefrontTheme.findUnique({
          where: { tenantId: tenant.id },
          select: {
            colorPrimary: true,
            colorPrimaryForeground: true,
            colorAccent: true,
            colorBackground: true,
            colorMuted: true,
            fontHeading: true,
            fontBody: true,
            radiusBase: true,
            logoMediaId: true,
            logoDarkMediaId: true,
            faviconMediaId: true,
          },
        }),
        tx.storefrontSettings.findUnique({
          where: { tenantId: tenant.id },
          select: {
            defaultCurrency: true,
            defaultLocale: true,
            showStockBelow: true,
            hidePricesWhenSignedOut: true,
            requireAuthForCheckout: true,
          },
        }),
      ])
    );

    return ok({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      settings: tenant.settings,
      theme: theme ?? null,
      storefront: storefront ?? {
        defaultCurrency: 'USD',
        defaultLocale: 'en-US',
        showStockBelow: 10,
        hidePricesWhenSignedOut: false,
        requireAuthForCheckout: false,
      },
    });
  });
  return Promise.resolve();
};

export default publicContentRoutes;
