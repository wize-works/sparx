// Universal-search projectors (docs/39 §5) for the commerce + CRM entity set.
//
// These live in @wizeworks/commerce — the same home as projectCustomer/projectOrder
// — because the commerce-indexer already depends on @wizeworks/commerce, so no new
// dependency edge / Dockerfile COPY is needed. They all read straight through
// @wizeworks/db's Prisma client (one schema spans Commerce + CRM models), so the
// CRM entities (b2b_account, quote, segment, pipeline, deal, task) project here
// without pulling @wizeworks/crm's service layer.
//
// Phase 1 (shipped): warehouse, discount, gift_card, b2b_account, quote.
// Phase 2 (breadth): collection, category, bundle, subscription, review, return,
// segment, pipeline, deal, task.
//
// Each entity becomes live by publishing `search.entity.changed` from its write
// sites (via @wizeworks/events `indexEntity`); reindex walks
// `commerceUniversalProjectors` to backfill regardless. The doc shape is
// dictated by wizeworks/packages/search/src/schemas/entities.ts — keep them in sync.

import { withTenant } from '@wizeworks/db';
import {
  type EntityProjector,
  type ProjectorContext,
  type UniversalSearchDocument,
  universalId,
} from '@wizeworks/search';

// ─── helpers ─────────────────────────────────────────────────────────

function epoch(d: Date | null | undefined): number {
  return d ? Math.floor(d.getTime() / 1000) : 0;
}

/** Drop nullish/empty entries; return undefined when nothing's left so the
 *  optional Typesense field is omitted rather than stored as `[]`. */
function keywords(values: (string | null | undefined)[]): string[] | undefined {
  const out = values
    .map((v) => v?.trim())
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return out.length > 0 ? Array.from(new Set(out)) : undefined;
}

/** Cap long free-text (CMS body, notes, descriptions) so the index stays lean. */
function snippet(s: string | null | undefined, max = 2000): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function customerName(c: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
}): string | undefined {
  // An explicit empty-string check (not `??`) so a blank full name falls
  // through to company / email rather than winning as ''.
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return c.companyName ?? c.email ?? undefined;
}

/** Read a trimmed non-empty string out of an untyped JSON value, else undefined. */
function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

/** 'blog_post' → 'Blog Post' — a readable label for a content type key. */
function humanizeTypeKey(k: string): string {
  return k.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── commerce: warehouse ─────────────────────────────────────────────

const warehouseProjector: EntityProjector = {
  entityType: 'warehouse',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.warehouse.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const w = await tx.warehouse.findFirst({ where: { id, deletedAt: null } });
      if (!w) return null;
      return {
        id: universalId(ctx.tenantId, 'warehouse', w.id),
        tenant_id: ctx.tenantId,
        entity_type: 'warehouse',
        // Warehouses belong to the Inventory module now (docs/100 P1e); the deep
        // link + facet follow the move even though the projector still lives here.
        module: 'inventory',
        record_id: w.id,
        title: w.name,
        subtitle: w.code,
        keywords: keywords([w.code, w.city, w.region, w.country, w.phone, w.type]),
        status: w.isActive ? 'active' : 'inactive',
        url: `/inventory/warehouses/${w.id}`,
        created_at: epoch(w.createdAt),
        updated_at: epoch(w.updatedAt),
      };
    }),
};

// ─── commerce: discount ──────────────────────────────────────────────

const discountProjector: EntityProjector = {
  entityType: 'discount',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.discount.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const d = await tx.discount.findFirst({ where: { id, deletedAt: null } });
      if (!d) return null;
      return {
        id: universalId(ctx.tenantId, 'discount', d.id),
        tenant_id: ctx.tenantId,
        entity_type: 'discount',
        module: 'commerce',
        record_id: d.id,
        title: d.name,
        subtitle: d.code ?? d.type,
        body: snippet(d.description),
        keywords: keywords([d.code, d.type, d.scope]),
        status: d.status,
        url: `/commerce/discounts/${d.id}`,
        created_at: epoch(d.createdAt),
        updated_at: epoch(d.updatedAt),
      };
    }),
};

// ─── commerce: gift_card (no soft-delete column) ─────────────────────

const giftCardProjector: EntityProjector = {
  entityType: 'gift_card',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.giftCard.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const g = await tx.giftCard.findFirst({ where: { id } });
      if (!g) return null;
      return {
        id: universalId(ctx.tenantId, 'gift_card', g.id),
        tenant_id: ctx.tenantId,
        entity_type: 'gift_card',
        module: 'commerce',
        record_id: g.id,
        title: g.code,
        subtitle: g.recipientName ?? g.recipientEmail ?? undefined,
        keywords: keywords([g.code, g.recipientEmail, g.recipientName]),
        status: g.status,
        url: `/commerce/gift-cards/${g.id}`,
        created_at: epoch(g.createdAt),
        updated_at: epoch(g.updatedAt),
      };
    }),
};

// ─── commerce: collection ────────────────────────────────────────────

const collectionProjector: EntityProjector = {
  entityType: 'collection',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.productCollection.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const c = await tx.productCollection.findFirst({ where: { id, deletedAt: null } });
      if (!c) return null;
      return {
        id: universalId(ctx.tenantId, 'collection', c.id),
        tenant_id: ctx.tenantId,
        entity_type: 'collection',
        module: 'commerce',
        record_id: c.id,
        title: c.name,
        subtitle: c.handle,
        body: snippet(c.description),
        keywords: keywords([c.handle, c.type]),
        // No publish flag on collections — a non-deleted collection is live;
        // mark 'active' so the public storefront status filter admits it.
        status: 'active',
        url: `/commerce/collections/${c.id}`,
        created_at: epoch(c.createdAt),
        updated_at: epoch(c.updatedAt),
      };
    }),
};

// ─── commerce: category ──────────────────────────────────────────────
// No standalone /commerce/categories/[id] route yet — link to the category
// list (never a dead link); tighten to the record when a detail route lands.

const categoryProjector: EntityProjector = {
  entityType: 'category',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.productCategory.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const c = await tx.productCategory.findFirst({ where: { id, deletedAt: null } });
      if (!c) return null;
      return {
        id: universalId(ctx.tenantId, 'category', c.id),
        tenant_id: ctx.tenantId,
        entity_type: 'category',
        module: 'commerce',
        record_id: c.id,
        title: c.name,
        subtitle: c.handle,
        body: snippet(c.description),
        keywords: keywords([c.handle]),
        url: '/commerce/categories',
        created_at: epoch(c.createdAt),
        updated_at: epoch(c.updatedAt),
      };
    }),
};

// ─── commerce: bundle (titled by its wrapper product; no soft-delete) ─

const bundleProjector: EntityProjector = {
  entityType: 'bundle',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.bundle.findMany({
        where: { bundleProduct: { deletedAt: null } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const b = await tx.bundle.findFirst({
        where: { id },
        include: {
          bundleProduct: { select: { title: true, handle: true, status: true, deletedAt: true } },
        },
      });
      if (!b || b.bundleProduct.deletedAt) return null;
      return {
        id: universalId(ctx.tenantId, 'bundle', b.id),
        tenant_id: ctx.tenantId,
        entity_type: 'bundle',
        module: 'commerce',
        record_id: b.id,
        title: b.bundleProduct.title,
        subtitle: b.pricingMode,
        keywords: keywords([b.bundleProduct.handle, b.pricingMode]),
        status: b.bundleProduct.status,
        url: `/commerce/bundles/${b.id}`,
        created_at: epoch(b.createdAt),
        updated_at: epoch(b.updatedAt),
      };
    }),
};

// ─── commerce: subscription (no name — titled by its customer) ────────

const subscriptionProjector: EntityProjector = {
  entityType: 'subscription',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.subscription.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const s = await tx.subscription.findFirst({
        where: { id },
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true, email: true } },
        },
      });
      if (!s) return null;
      const who = customerName(s.customer);
      return {
        id: universalId(ctx.tenantId, 'subscription', s.id),
        tenant_id: ctx.tenantId,
        entity_type: 'subscription',
        module: 'commerce',
        record_id: s.id,
        title: who ?? 'Subscription',
        subtitle: `every ${s.intervalCount} ${s.intervalUnit}`,
        keywords: keywords([who, s.customer.email, s.providerSlug]),
        status: s.status,
        url: `/commerce/subscriptions/${s.id}`,
        created_at: epoch(s.createdAt),
        updated_at: epoch(s.updatedAt),
      };
    }),
};

// ─── commerce: review ─────────────────────────────────────────────────

const reviewProjector: EntityProjector = {
  entityType: 'review',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.productReview.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const r = await tx.productReview.findFirst({
        where: { id, deletedAt: null },
        include: { product: { select: { title: true } } },
      });
      if (!r) return null;
      // title is a non-null column but may be blank — fall through to a body
      // snippet (`||`, not `??`, so an empty string falls through).
      const title = r.title || (snippet(r.body, 80) ?? 'Review');
      return {
        id: universalId(ctx.tenantId, 'review', r.id),
        tenant_id: ctx.tenantId,
        entity_type: 'review',
        module: 'commerce',
        record_id: r.id,
        title,
        subtitle: r.product.title,
        body: snippet(r.body),
        keywords: keywords([r.displayName, r.product.title]),
        status: r.status,
        url: `/commerce/reviews/${r.id}`,
        created_at: epoch(r.createdAt),
        updated_at: epoch(r.updatedAt),
      };
    }),
};

// ─── commerce: return / RMA ───────────────────────────────────────────

const returnProjector: EntityProjector = {
  entityType: 'return',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.returnRequest.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const r = await tx.returnRequest.findFirst({ where: { id } });
      if (!r) return null;
      // ReturnRequest has no `order` relation — fetch the order number for a
      // human-searchable title (RMAs are found by their order).
      const order = await tx.order.findUnique({
        where: { id: r.orderId },
        select: { orderNumber: true },
      });
      const orderNo = order?.orderNumber;
      return {
        id: universalId(ctx.tenantId, 'return', r.id),
        tenant_id: ctx.tenantId,
        entity_type: 'return',
        module: 'commerce',
        record_id: r.id,
        title: orderNo ? `Return · ${orderNo}` : `Return ${r.id.slice(0, 8)}`,
        subtitle: r.preferredOutcome,
        keywords: keywords([orderNo, r.status, r.preferredOutcome, r.requestedBy]),
        status: r.status,
        url: `/commerce/returns/${r.id}`,
        created_at: epoch(r.createdAt),
        updated_at: epoch(r.updatedAt),
      };
    }),
};

// ─── crm: b2b_account ────────────────────────────────────────────────

const b2bAccountProjector: EntityProjector = {
  entityType: 'b2b_account',
  module: 'crm',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.company.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const a = await tx.company.findFirst({ where: { id, deletedAt: null } });
      if (!a) return null;
      return {
        id: universalId(ctx.tenantId, 'b2b_account', a.id),
        tenant_id: ctx.tenantId,
        entity_type: 'b2b_account',
        module: 'crm',
        record_id: a.id,
        title: a.companyName,
        subtitle: a.pricingTier ?? a.status,
        body: snippet(a.notes),
        keywords: keywords([a.companyName, a.taxId, a.website, ...a.tags]),
        status: a.status,
        url: `/crm/b2b/${a.id}`,
        created_at: epoch(a.createdAt),
        updated_at: epoch(a.updatedAt),
      };
    }),
};

// ─── invoicing: billing document (quote/estimate/invoice/receipt) ─────
// (soft-deletable — excludes deletedAt rows, unlike the other CRM projectors
// above which have no soft-delete column)

const billingDocumentProjector: EntityProjector = {
  entityType: 'billing_document',
  module: 'invoicing',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.billingDocument.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const doc = await tx.billingDocument.findFirst({
        where: { id, deletedAt: null },
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true, email: true } },
          company: { select: { companyName: true } },
        },
      });
      if (!doc) return null;
      const who =
        doc.company?.companyName ?? (doc.customer ? customerName(doc.customer) : undefined);
      return {
        id: universalId(ctx.tenantId, 'billing_document', doc.id),
        tenant_id: ctx.tenantId,
        entity_type: 'billing_document',
        module: 'invoicing',
        record_id: doc.id,
        title: doc.number ?? 'Untitled document',
        subtitle: who ?? doc.status,
        keywords: keywords([doc.number, who]),
        status: doc.status,
        url: `/invoicing/documents/${doc.id}`,
        created_at: epoch(doc.createdAt),
        updated_at: epoch(doc.updatedAt),
      };
    }),
};

// ─── crm: segment (archive = soft-inactive; kept in index with status) ─

const segmentProjector: EntityProjector = {
  entityType: 'segment',
  module: 'crm',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.segment.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const s = await tx.segment.findFirst({ where: { id } });
      if (!s) return null;
      return {
        id: universalId(ctx.tenantId, 'segment', s.id),
        tenant_id: ctx.tenantId,
        entity_type: 'segment',
        module: 'crm',
        record_id: s.id,
        title: s.name,
        subtitle: s.slug,
        body: snippet(s.description),
        keywords: keywords([s.slug]),
        status: s.archivedAt ? 'archived' : 'active',
        url: `/crm/segments/${s.id}`,
        created_at: epoch(s.createdAt),
        updated_at: epoch(s.updatedAt),
      };
    }),
};

// ─── crm: pipeline ────────────────────────────────────────────────────

const pipelineProjector: EntityProjector = {
  entityType: 'pipeline',
  module: 'crm',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.pipeline.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const p = await tx.pipeline.findFirst({ where: { id } });
      if (!p) return null;
      return {
        id: universalId(ctx.tenantId, 'pipeline', p.id),
        tenant_id: ctx.tenantId,
        entity_type: 'pipeline',
        module: 'crm',
        record_id: p.id,
        title: p.name,
        subtitle: p.slug,
        keywords: keywords([p.slug]),
        status: p.archivedAt ? 'archived' : 'active',
        url: `/crm/pipelines/${p.id}`,
        created_at: epoch(p.createdAt),
        updated_at: epoch(p.updatedAt),
      };
    }),
};

// ─── crm: deal ────────────────────────────────────────────────────────

const dealProjector: EntityProjector = {
  entityType: 'deal',
  module: 'crm',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.deal.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const d = await tx.deal.findFirst({
        where: { id, deletedAt: null },
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true, email: true } },
          company: { select: { companyName: true } },
          stage: { select: { name: true, stageType: true } },
        },
      });
      if (!d) return null;
      const who = d.company?.companyName ?? (d.customer ? customerName(d.customer) : undefined);
      return {
        id: universalId(ctx.tenantId, 'deal', d.id),
        tenant_id: ctx.tenantId,
        entity_type: 'deal',
        module: 'crm',
        record_id: d.id,
        title: d.title,
        subtitle: who ?? d.stage.name,
        keywords: keywords([who, d.source, ...d.tags]),
        status: d.stage.stageType, // open | won | lost
        url: `/crm/deals/${d.id}`,
        created_at: epoch(d.createdAt),
        updated_at: epoch(d.updatedAt),
      };
    }),
};

// ─── crm: task ────────────────────────────────────────────────────────
// No standalone /crm/tasks/[id] route yet — link to the task list (never a
// dead link); tighten to the record when a detail route lands.

const taskProjector: EntityProjector = {
  entityType: 'task',
  module: 'crm',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.task.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const t = await tx.task.findFirst({ where: { id } });
      if (!t) return null;
      return {
        id: universalId(ctx.tenantId, 'task', t.id),
        tenant_id: ctx.tenantId,
        entity_type: 'task',
        module: 'crm',
        record_id: t.id,
        title: t.title,
        subtitle: t.priority,
        body: snippet(t.description),
        keywords: keywords([t.priority]),
        status: t.status,
        url: '/crm/tasks',
        created_at: epoch(t.createdAt),
        updated_at: epoch(t.updatedAt),
      };
    }),
};

// ─── commerce: product (also a rich collection; here for global search) ─
// Products keep their faceted `products` collection (storefront PLP, fitment).
// A lightweight universal doc additionally lands here (docs/39 §4.1) so global
// ⌘K + the public storefront "search everything" are one query. Real-time via
// the product.* tee in events.ts; SKU search stays the rich collection's job.

const productProjector: EntityProjector = {
  entityType: 'product',
  module: 'commerce',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.product.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const p = await tx.product.findFirst({ where: { id, deletedAt: null } });
      if (!p) return null;
      return {
        id: universalId(ctx.tenantId, 'product', p.id),
        tenant_id: ctx.tenantId,
        entity_type: 'product',
        module: 'commerce',
        record_id: p.id,
        title: p.title,
        subtitle: p.vendor ?? undefined,
        keywords: keywords([p.handle, p.vendor, ...p.tags]),
        status: p.status, // draft | active | archived (public search filters active)
        url: `/commerce/products/${p.id}`,
        created_at: epoch(p.createdAt),
        updated_at: epoch(p.updatedAt),
      };
    }),
};

// ─── cms: page (reindex-only — CMS emits no domain events yet, docs/39 §6.3) ─
// Read via the shared Prisma client (no @wizeworks/cms dep / Dockerfile edge, same
// as the CRM projectors). Public storefront search filters status:='published'.
//
// A "page" here is a `ContentEntry` with `typeKey = 'page'` — a tenant's policy and
// standalone pages. It used to read the `Page` MODEL, which is deprecated and holds
// ZERO rows platform-wide, so this projector produced no document for anybody and
// public search's `cms_page` branch could never match (issue 378). The SEO audit had
// always resolved `cms_page` against `contentEntry`; this now agrees with it.
//
// Its sibling `contentEntryProjector` covers every OTHER typeKey, and the split is
// what keeps the two from indexing the same row twice.

const cmsPageProjector: EntityProjector = {
  entityType: 'cms_page',
  module: 'cms',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.contentEntry.findMany({
        where: { typeKey: 'page', deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const p = await tx.contentEntry.findFirst({
        where: { id, typeKey: 'page', deletedAt: null },
      });
      if (!p) return null;
      const body = (p.body ?? {}) as Record<string, unknown>;
      const seo = (p.seoJson ?? {}) as Record<string, unknown>;
      // No title COLUMN on a content entry — it lives in the body the type defines.
      const title = pickString(body.title) ?? p.slug ?? 'Untitled page';
      return {
        id: universalId(ctx.tenantId, 'cms_page', p.id),
        tenant_id: ctx.tenantId,
        entity_type: 'cms_page',
        module: 'cms',
        record_id: p.id,
        title,
        // Nullable on a content entry, unlike the `Page` column this used to read.
        subtitle: p.slug ?? undefined,
        body: snippet(pickString(seo.description) ?? pickString(body.excerpt)),
        keywords: keywords([p.slug]),
        status: p.status, // draft | published (public search filters published)
        url: `/content/${p.id}`,
        created_at: epoch(p.createdAt),
        updated_at: epoch(p.updatedAt),
      };
    }),
};

// ─── sitebuilder: site (docs/39 Ph2 / docs/66 — multi-property) ──────
// A tenant's web properties. Real-time via the site.* indexEntity calls in
// the /v1/properties routes; reindex backfills regardless. Deep-links to the
// sites management surface.

const siteProjector: EntityProjector = {
  entityType: 'site',
  module: 'sitebuilder',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.property.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const p = await tx.property.findFirst({ where: { id } });
      if (!p) return null;
      return {
        id: universalId(ctx.tenantId, 'site', p.id),
        tenant_id: ctx.tenantId,
        entity_type: 'site',
        module: 'sitebuilder',
        record_id: p.id,
        title: p.name,
        subtitle: p.isPrimary ? `${p.slug} · primary site` : p.slug,
        keywords: keywords([p.slug]),
        status: p.status, // active | paused | archived
        url: '/settings/sites',
        created_at: epoch(p.createdAt),
        updated_at: epoch(p.updatedAt),
      };
    }),
};

// ─── cms: content entry (reindex-only, like cms_page) ─────────────────
// Covers every ContentEntry typeKey EXCEPT `page` (the Page model is handled
// by cmsPageProjector; ContentEntry `page` rows are legal-policy docs). Title
// lives in the body JSON — there is no title column. Public search filters
// status:='published'.

const contentEntryProjector: EntityProjector = {
  entityType: 'cms_entry',
  module: 'cms',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.contentEntry.findMany({
        where: { deletedAt: null, typeKey: { not: 'page' } },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const e = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
      if (!e || e.typeKey === 'page') return null;
      const body = (e.body ?? {}) as Record<string, unknown>;
      const title =
        pickString(body.title) ??
        pickString(body.name) ??
        pickString(body.heading) ??
        e.slug ??
        `Untitled ${e.typeKey}`;
      return {
        id: universalId(ctx.tenantId, 'cms_entry', e.id),
        tenant_id: ctx.tenantId,
        entity_type: 'cms_entry',
        module: 'cms',
        record_id: e.id,
        title,
        subtitle: `${humanizeTypeKey(e.typeKey)} · ${e.status}`,
        body: snippet(pickString(body.excerpt) ?? pickString(body.summary)),
        keywords: keywords([e.slug, e.typeKey]),
        status: e.status, // draft | published | scheduled | archived
        url: `/cms/${e.id}`,
        created_at: epoch(e.createdAt),
        updated_at: epoch(e.updatedAt),
      };
    }),
};

// ─── cms: media asset (reindex-only) ──────────────────────────────────
// Filename + alt-text + mime search for the ⌘K media-finder use case.

const mediaProjector: EntityProjector = {
  entityType: 'media',
  module: 'cms',
  listIdsForTenant: (ctx: ProjectorContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx.mediaAsset.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }),
  project: (ctx: ProjectorContext, id: string) =>
    withTenant(ctx, async (tx): Promise<UniversalSearchDocument | null> => {
      const m = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null } });
      if (!m) return null;
      return {
        id: universalId(ctx.tenantId, 'media', m.id),
        tenant_id: ctx.tenantId,
        entity_type: 'media',
        module: 'cms',
        record_id: m.id,
        title: m.originalFilename,
        subtitle: m.altText ?? m.mimeType,
        keywords: keywords([m.mimeType, m.altText, m.caption]),
        status: m.status, // uploading | ready | failed
        url: `/cms/media/${m.id}`,
        created_at: epoch(m.createdAt),
        updated_at: epoch(m.updatedAt),
      };
    }),
};

/** Universal projectors contributed by Commerce + CRM. The commerce-indexer
 *  registers these into its projector registry (reindex + event dispatch). */
export const commerceUniversalProjectors: EntityProjector[] = [
  // Phase 1 (shipped)
  warehouseProjector,
  discountProjector,
  giftCardProjector,
  b2bAccountProjector,
  billingDocumentProjector,
  // Phase 2 — breadth (commerce)
  collectionProjector,
  categoryProjector,
  bundleProjector,
  subscriptionProjector,
  reviewProjector,
  returnProjector,
  // Phase 2 — breadth (crm)
  segmentProjector,
  pipelineProjector,
  dealProjector,
  taskProjector,
  // Public storefront content (also powers global ⌘K)
  productProjector,
  cmsPageProjector,
  // Site Builder + CMS breadth (docs/39 Ph2 / docs/66)
  siteProjector,
  contentEntryProjector,
  mediaProjector,
];
