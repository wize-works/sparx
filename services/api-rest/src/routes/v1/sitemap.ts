// Per-tenant sitemap.xml.
//
//   GET /v1/sitemap.xml?tenant=<slug>     (public — no auth)
//
// Streams a basic sitemap from `content_entries` where the entry's
// resolved content type has a `urlPattern`. Published entries only. The
// route runs outside auth/RLS because it's a public consumer endpoint, so
// we look up the tenant by slug and SET LOCAL the GUC ourselves.
//
// Pure-RLS is preserved: we never bypass it, just choose which tenant to
// scope to based on the public query parameter.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, withTenant } from '@sparx/db';
import { badRequest, notFound } from '@sparx/api-core/errors';

const Query = z.object({ tenant: z.string().min(1).max(63) });

function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => {
    switch (ch) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

const sitemapRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/sitemap.xml', async (request, reply) => {
    const { tenant: slug } = Query.parse(request.query);

    // Tenants table has no RLS, so we can look it up directly to get the id.
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw notFound('Tenant', slug);
    if (!tenant.settings) throw badRequest('Tenant has no published configuration.');

    const settings = tenant.settings as Record<string, unknown>;
    const baseUrl =
      typeof settings.primaryDomain === 'string'
        ? `https://${settings.primaryDomain}`
        : `https://${slug}.sparx.works`;

    // Pull all published, routable entries inside this tenant's context.
    const rows = await withTenant({ tenantId: tenant.id }, (tx) =>
      tx.contentEntry.findMany({
        where: { status: 'published', deletedAt: null, slug: { not: null } },
        select: { slug: true, typeKey: true, updatedAt: true, publishedAt: true },
      })
    );

    // Look up url patterns for the relevant types in one round-trip.
    const typeKeys = Array.from(new Set(rows.map((r) => r.typeKey)));
    const types = await withTenant({ tenantId: tenant.id }, (tx) =>
      tx.contentType.findMany({
        where: { key: { in: typeKeys }, urlPattern: { not: null } },
        select: { key: true, urlPattern: true },
      })
    );
    const patterns = new Map(types.map((t) => [t.key, t.urlPattern!]));

    const urls: string[] = [];
    for (const r of rows) {
      const pattern = patterns.get(r.typeKey);
      if (!pattern || !r.slug) continue;
      const path = pattern.replace('{slug}', r.slug);
      const lastmod = (r.publishedAt ?? r.updatedAt).toISOString();
      urls.push(
        `<url><loc>${xmlEscape(`${baseUrl}${path}`)}</loc><lastmod>${lastmod}</lastmod></url>`
      );
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

    reply
      .header('Content-Type', 'application/xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
      .send(xml);
  });
  return Promise.resolve();
};

export default sitemapRoutes;
