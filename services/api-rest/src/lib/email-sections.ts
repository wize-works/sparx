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
import { discountService, productService } from '@sparx/commerce';
import { renderDocToHtml } from '@sparx/cms-editor/serialize';
import {
  AbandonedCartConfig,
  ActivePromotionConfig,
  CollectionGridConfig,
  FeaturedProductsConfig,
  ImageConfig,
  LatestBlogPostsConfig,
  RecommendedProductsConfig,
  RichTextConfig,
  type BlogPostData,
  type CartLineData,
  type CollectionTileData,
  type EmailSectionInstance,
  type OrderSummaryData,
  type ProductCardData,
  type SectionData,
  type SectionDataMap,
} from '@sparx/email-sections';
import type { ServiceContext } from '@sparx/email-platform';
import type { z } from 'zod';

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
    items = c.productIds.map((id) => byId.get(id)).filter((p): p is ProductItem => Boolean(p));
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

async function resolveBlog(ctx: ServiceContext, slug: string, raw: unknown): Promise<SectionData> {
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

// ── Personalized resolvers (per recipient) ───────────────────────────────────

async function resolveCart(
  ctx: ServiceContext,
  slug: string,
  raw: unknown,
  recipient?: EmailRecipient
): Promise<SectionData> {
  const c = parsed(AbandonedCartConfig, raw);
  if (!recipient?.customerId) return { kind: 'cart', lines: [] };
  // Most recent un-recovered cart (open or abandoned) with its lines.
  const cart = await withTenant(ctx, (tx) =>
    tx.cart.findFirst({
      where: { customerId: recipient.customerId, recoveredAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        items: {
          select: {
            quantity: true,
            unitPriceCents: true,
            variant: { select: { product: { select: { title: true } } } },
          },
        },
      },
    })
  );
  if (!cart?.items.length) return { kind: 'cart', lines: [] };
  const lines: CartLineData[] = cart.items.slice(0, c.maxItems).map((it) => ({
    title: it.variant.product.title,
    quantity: it.quantity,
    priceLabel: c.showPrices ? money(it.unitPriceCents) : undefined,
  }));
  return { kind: 'cart', lines, recoverUrl: storefrontUrl(slug, '/cart') };
}

async function resolveRecentOrder(
  ctx: ServiceContext,
  raw: unknown,
  recipient?: EmailRecipient
): Promise<SectionData> {
  if (!recipient?.customerId) return { kind: 'order', order: null };
  const order = await withTenant(ctx, (tx) =>
    tx.order.findFirst({
      where: { customerId: recipient.customerId },
      orderBy: { placedAt: 'desc' },
      select: {
        orderNumber: true,
        status: true,
        total: true,
        placedAt: true,
        items: { select: { name: true, quantity: true } },
      },
    })
  );
  if (!order) return { kind: 'order', order: null };
  const summary: OrderSummaryData = {
    numberLabel: order.orderNumber,
    statusLabel: order.status,
    totalLabel: `$${Number(order.total).toFixed(2)}`,
    dateLabel: order.placedAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    items: order.items.map((i) => ({ title: i.name, quantity: i.quantity })),
  };
  return { kind: 'order', order: summary };
}

async function resolveLoyalty(
  ctx: ServiceContext,
  recipient?: EmailRecipient
): Promise<SectionData> {
  // No points model exists — the loyalty section surfaces the store-credit
  // balance (docs/31 §6 loyalty-points; revisit if a points engine lands).
  if (!recipient?.customerId) return { kind: 'loyalty', loyalty: null };
  const bal = await discountService.getStoreCreditBalance(ctx, recipient.customerId);
  if (!bal || bal.balanceCents <= 0) return { kind: 'loyalty', loyalty: null };
  return {
    kind: 'loyalty',
    loyalty: { pointsLabel: money(bal.balanceCents), tierName: 'Store credit available' },
  };
}

async function resolveRecommended(
  ctx: ServiceContext,
  slug: string,
  raw: unknown
): Promise<SectionData> {
  // v1 stand-in: newest products (flagged isFallback). A real per-recipient
  // recommendation source is deferred (docs/31 §13.1).
  const c = parsed(RecommendedProductsConfig, raw);
  const items = (
    await productService.list(ctx, { status: 'active', take: c.limit, sortBy: 'createdAt' })
  ).items;
  const products: ProductCardData[] = items.slice(0, c.limit).map((p) => ({
    title: p.title,
    priceLabel: money(p.priceMinCents),
    url: storefrontUrl(slug, `/products/${p.handle}`),
    imageUrl: p.imageUrl ?? undefined,
  }));
  return { kind: 'products', products, isFallback: true };
}

// ── Entry points ─────────────────────────────────────────────────────────────

async function resolveOne(
  ctx: ServiceContext,
  slug: string,
  section: EmailSectionInstance,
  recipient?: EmailRecipient
): Promise<SectionData> {
  switch (section.type) {
    case 'rich-text': {
      const c = parsed(RichTextConfig, section.config);
      return { kind: 'rich-text', html: renderDocToHtml(c.doc) };
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
    case 'abandoned-cart':
      return resolveCart(ctx, slug, section.config, recipient);
    case 'recent-order':
      return resolveRecentOrder(ctx, section.config, recipient);
    case 'loyalty-points':
      return resolveLoyalty(ctx, recipient);
    case 'recommended-products':
      return resolveRecommended(ctx, slug, section.config);
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
  recipient?: EmailRecipient
): Promise<SectionDataMap> {
  const slug = await tenantSlug(ctx);
  const out: SectionDataMap = {};
  await Promise.all(
    sections.map(async (s) => {
      out[s.id] = await resolveOne(ctx, slug, s, recipient);
    })
  );
  return out;
}

/** A `resolveData` callback bound to a request's email context. Render-once
 *  (no recipient) — personalized sections render empty (preview/non-personalized
 *  broadcasts). The per-recipient path calls resolveBody with a recipient. */
export function sectionResolver(ctx: ServiceContext) {
  return (sections: EmailSectionInstance[]): Promise<SectionDataMap> => resolveBody(ctx, sections);
}
