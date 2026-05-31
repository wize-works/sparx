// Email section data resolver (docs/31 §7.2). Reads tenant data (commerce + CMS)
// and produces the SectionData map the @sparx/email renderer consumes. Lives in
// api-rest — the composition root that already has @sparx/commerce — so
// @sparx/email-platform (imported by the lean email-worker) stays commerce-free.
// Injected into email-platform's render functions as the `resolveData` callback.
//
// Static sections resolve trivially (rich-text → serialized HTML, image → media
// URL). Dynamic sections read tenant data once per send. Personalized sections
// return `none` here; their per-recipient resolution lands with P5.

import { withTenant } from '@sparx/db';
import { collectionService, discountService, productService } from '@sparx/commerce';
import { renderDocToHtml } from '@sparx/cms-editor/serialize';
import type { CmsDoc } from '@sparx/cms-editor';
import {
  ActivePromotionConfig,
  CollectionGridConfig,
  FeaturedProductsConfig,
  ImageConfig,
  LatestBlogPostsConfig,
  RichTextConfig,
  type BlogPostData,
  type CollectionTileData,
  type EmailSectionInstance,
  type ProductCardData,
  type SectionData,
  type SectionDataMap,
} from '@sparx/email-sections';
import type { ServiceContext } from '@sparx/email-platform';
import { z } from 'zod';

/** Recipient binding for personalized sections (resolved at dispatch, P5). */
export interface EmailRecipient {
  email: string;
  customerId?: string | null;
}

type ProductItem = Awaited<ReturnType<typeof productService.list>>['items'][number];

const API_BASE =
  process.env.SPARX_PUBLIC_API_URL ?? process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';
// Storefront base for clickable links. `{slug}` is substituted per tenant; when
// unset, links fall back to path-only (still valid markup, refined once tenant
// domain resolution is wired).
const STOREFRONT_BASE = process.env.SPARX_STOREFRONT_BASE ?? '';

function mediaUrl(mediaId: string | null | undefined, slug: string): string | undefined {
  if (!mediaId) return undefined;
  return `${API_BASE}/v1/public/media/${encodeURIComponent(mediaId)}?tenant=${encodeURIComponent(slug)}`;
}

function storefrontUrl(slug: string, path: string): string {
  if (!STOREFRONT_BASE) return path;
  return `${STOREFRONT_BASE.replace('{slug}', slug)}${path}`;
}

function money(cents: number | null): string {
  if (cents == null) return '';
  return `$${(cents / 100).toFixed(2)}`;
}

function undef(v: string): string | undefined {
  return v ? v : undefined;
}

function parsed<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  return r.success ? r.data : schema.parse({});
}

async function tenantSlug(ctx: ServiceContext): Promise<string> {
  const row = await withTenant(ctx, (tx) =>
    tx.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true } })
  );
  return row?.slug ?? '';
}

// ── Dynamic resolvers ────────────────────────────────────────────────────────

async function resolveFeatured(
  ctx: ServiceContext,
  slug: string,
  raw: unknown
): Promise<SectionData> {
  const c = parsed(FeaturedProductsConfig, raw);
  let items: ProductItem[];
  if (c.source === 'collection' && c.collectionId) {
    items = (
      await productService.list(ctx, {
        status: 'active',
        collectionId: c.collectionId,
        take: c.limit,
        sortBy: 'updatedAt',
      })
    ).items;
  } else if (c.source === 'manual' && c.productIds.length) {
    const all = (await productService.list(ctx, { status: 'active', take: 100 })).items;
    const byId = new Map(all.map((p) => [p.id, p]));
    items = c.productIds
      .map((id) => byId.get(id))
      .filter((p): p is ProductItem => Boolean(p));
  } else {
    items = (
      await productService.list(ctx, { status: 'active', take: c.limit, sortBy: 'createdAt' })
    ).items;
  }
  const products: ProductCardData[] = items.slice(0, c.limit).map((p) => ({
    title: p.title,
    priceLabel: money(p.priceMinCents),
    url: storefrontUrl(slug, `/products/${p.handle}`),
    imageUrl: p.imageUrl ?? undefined,
  }));
  return { kind: 'products', products };
}

async function resolveCollections(
  ctx: ServiceContext,
  slug: string,
  raw: unknown
): Promise<SectionData> {
  const c = parsed(CollectionGridConfig, raw);
  if (!c.collectionIds.length) return { kind: 'collections', collections: [] };
  const rows = await withTenant(ctx, (tx) =>
    tx.productCollection.findMany({
      where: { id: { in: c.collectionIds }, deletedAt: null },
      select: { id: true, name: true, handle: true, heroMediaId: true },
    })
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const collections: CollectionTileData[] = c.collectionIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({
      title: r.name,
      url: storefrontUrl(slug, `/collections/${r.handle}`),
      imageUrl: mediaUrl(r.heroMediaId, slug),
    }));
  return { kind: 'collections', collections };
}

async function resolveBlog(
  ctx: ServiceContext,
  slug: string,
  raw: unknown
): Promise<SectionData> {
  const c = parsed(LatestBlogPostsConfig, raw);
  const rows = await withTenant(ctx, (tx) =>
    tx.contentEntry.findMany({
      where: { typeKey: 'blog_post', status: 'published', deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      take: c.limit,
      select: { slug: true, body: true, publishedAt: true },
    })
  );
  const posts: BlogPostData[] = rows.map((r) => {
    const b = (r.body ?? {}) as { title?: string; excerpt?: string; featuredImage?: string };
    return {
      title: b.title ?? 'Untitled',
      url: storefrontUrl(slug, `/blog/${r.slug ?? ''}`),
      excerpt: b.excerpt,
      imageUrl: mediaUrl(b.featuredImage, slug),
      dateLabel: r.publishedAt
        ? r.publishedAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : undefined,
    };
  });
  return { kind: 'blog', posts };
}

async function resolvePromotion(ctx: ServiceContext, raw: unknown): Promise<SectionData> {
  const c = parsed(ActivePromotionConfig, raw);
  const now = Date.now();
  const active = (await discountService.listDiscounts(ctx, { status: 'active' })).find((d) => {
    const startOk = !d.startAt || new Date(d.startAt).getTime() <= now;
    const endOk = !d.endAt || new Date(d.endAt).getTime() >= now;
    return startOk && endOk;
  });
  if (active) {
    return {
      kind: 'promotion',
      promotion: {
        title: active.name || c.heading,
        body: active.description ?? undefined,
        ctaLabel: undef(c.ctaLabel),
        ctaHref: undef(c.ctaHref),
      },
    };
  }
  if (c.onEmpty === 'alternate' && c.fallbackText) {
    return {
      kind: 'promotion',
      promotion: {
        title: c.heading,
        body: c.fallbackText,
        ctaLabel: undef(c.ctaLabel),
        ctaHref: undef(c.ctaHref),
      },
    };
  }
  return { kind: 'promotion', promotion: null };
}

// ── Entry points ─────────────────────────────────────────────────────────────

async function resolveOne(
  ctx: ServiceContext,
  slug: string,
  section: EmailSectionInstance
): Promise<SectionData> {
  switch (section.type) {
    case 'rich-text': {
      const c = parsed(RichTextConfig, section.config);
      return { kind: 'rich-text', html: renderDocToHtml(c.doc as unknown as CmsDoc) };
    }
    case 'image': {
      const c = parsed(ImageConfig, section.config);
      return { kind: 'image', src: mediaUrl(c.mediaId, slug) };
    }
    case 'featured-products':
      return resolveFeatured(ctx, slug, section.config);
    case 'collection-grid':
      return resolveCollections(ctx, slug, section.config);
    case 'latest-blog-posts':
      return resolveBlog(ctx, slug, section.config);
    case 'active-promotion':
      return resolvePromotion(ctx, section.config);
    // Personalized sections resolve per recipient at dispatch (P5).
    default:
      return { kind: 'none' };
  }
}

/**
 * Resolve a whole section list to its data map. `recipient` is accepted for the
 * P5 personalization path; ignored today (personalized sections return `none`).
 */
export async function resolveBody(
  ctx: ServiceContext,
  sections: EmailSectionInstance[],
  _recipient?: EmailRecipient
): Promise<SectionDataMap> {
  const slug = await tenantSlug(ctx);
  const out: SectionDataMap = {};
  await Promise.all(
    sections.map(async (s) => {
      out[s.id] = await resolveOne(ctx, slug, s);
    })
  );
  return out;
}

/** A `resolveData` callback bound to a request's email context. */
export function sectionResolver(ctx: ServiceContext) {
  return (sections: EmailSectionInstance[]): Promise<SectionDataMap> => resolveBody(ctx, sections);
}
