// Per-tenant RSS 2.0 feed.
//
//   GET /v1/rss.xml?tenant=<slug>&type=<typeKey>&author=<uuid>
//
// Public, no auth — pairs with /v1/sitemap.xml. Defaults to `type=blog_post`
// since that's the canonical use case, but any routable content type with a
// `urlPattern` works. Returns the 50 newest published entries inside the
// tenant; older items fall off the feed naturally (RSS readers cache).
//
// Tenant resolution follows the same pattern as sitemap.ts: tenants has no
// RLS so we look it up directly, then SET LOCAL its tenant_id via
// withTenant() before any RLS-protected query.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, withTenant } from '@sparx/db';
import { badRequest, notFound } from '../../errors.js';

const Query = z.object({
  tenant: z.string().min(1).max(63),
  type: z.string().min(1).max(63).optional(),
  author: z.string().uuid().optional(),
});

const FEED_LIMIT = 50;

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

function rfc822(date: Date): string {
  // RSS 2.0 mandates RFC 822 dates ("Thu, 28 May 2026 12:00:00 +0000"). JS
  // `toUTCString()` already returns exactly that format with a trailing
  // "GMT" instead of "+0000"; both are valid per the spec, but readers
  // are happier with "+0000".
  return date.toUTCString().replace(/GMT$/, '+0000');
}

const rssRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/rss.xml', async (request, reply) => {
    const q = Query.parse(request.query);
    const typeKey = q.type ?? 'blog_post';

    const tenant = await prisma.tenant.findUnique({ where: { slug: q.tenant } });
    if (!tenant) throw notFound('Tenant', q.tenant);
    if (!tenant.settings) throw badRequest('Tenant has no published configuration.');

    const settings = tenant.settings as Record<string, unknown>;
    const baseUrl =
      typeof settings.primaryDomain === 'string'
        ? `https://${settings.primaryDomain}`
        : `https://${q.tenant}.sparx.works`;

    const type = await withTenant({ tenantId: tenant.id }, (tx) =>
      tx.contentType.findFirst({
        where: { key: typeKey, urlPattern: { not: null } },
        select: { key: true, name: true, pluralName: true, urlPattern: true },
      })
    );
    if (!type) {
      throw notFound(`Routable content type "${typeKey}"`);
    }
    // The findFirst above already filtered out null patterns; this
    // assertion narrows for TypeScript.
    const urlPattern = type.urlPattern as string;

    const rows = await withTenant({ tenantId: tenant.id }, (tx) =>
      tx.contentEntry.findMany({
        where: {
          typeKey,
          status: 'published',
          deletedAt: null,
          slug: { not: null },
          ...(q.author ? { authorId: q.author } : {}),
        },
        orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
        take: FEED_LIMIT,
        select: {
          id: true,
          slug: true,
          body: true,
          seoJson: true,
          publishedAt: true,
          updatedAt: true,
        },
      })
    );

    const items = rows.map((r) => {
      const body = (r.body ?? {}) as Record<string, unknown>;
      const seo = (r.seoJson ?? {}) as Record<string, unknown>;
      const title =
        (typeof seo.title === 'string' && seo.title) ||
        (typeof body.title === 'string' && body.title) ||
        (r.slug ?? r.id);
      const description =
        (typeof seo.description === 'string' && seo.description) ||
        (typeof body.excerpt === 'string' && body.excerpt) ||
        (typeof body.summary === 'string' && body.summary) ||
        '';
      const path = urlPattern.replace('{slug}', r.slug ?? '');
      const link = `${baseUrl}${path}`;
      const pubDate = rfc822(r.publishedAt ?? r.updatedAt);
      return [
        '<item>',
        `<title>${xmlEscape(String(title))}</title>`,
        `<link>${xmlEscape(link)}</link>`,
        `<guid isPermaLink="true">${xmlEscape(link)}</guid>`,
        `<pubDate>${pubDate}</pubDate>`,
        description ? `<description>${xmlEscape(String(description))}</description>` : '',
        '</item>',
      ]
        .filter(Boolean)
        .join('');
    });

    const channelTitle = `${tenant.name} — ${type.pluralName}`;
    const channelLink = baseUrl;
    const channelDesc = `Latest ${type.pluralName.toLowerCase()} from ${tenant.name}.`;
    const buildDate = rfc822(new Date());
    const selfHref = `${request.protocol}://${request.hostname}/v1/rss.xml?tenant=${encodeURIComponent(q.tenant)}&type=${encodeURIComponent(typeKey)}`;

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
      `<channel>\n` +
      `<title>${xmlEscape(channelTitle)}</title>\n` +
      `<link>${xmlEscape(channelLink)}</link>\n` +
      `<description>${xmlEscape(channelDesc)}</description>\n` +
      `<language>en</language>\n` +
      `<lastBuildDate>${buildDate}</lastBuildDate>\n` +
      `<atom:link href="${xmlEscape(selfHref)}" rel="self" type="application/rss+xml"/>\n` +
      items.join('\n') +
      `\n</channel>\n</rss>`;

    reply
      .header('Content-Type', 'application/rss+xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
      .send(xml);
  });
  return Promise.resolve();
};

export default rssRoutes;
