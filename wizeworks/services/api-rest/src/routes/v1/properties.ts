// Properties — a tenant's web properties (the multi-site axis, docs/49). One
// TENANT has one-or-more PROPERTIES (a property = a distinct site: presentation
// + page tree + domain) over the shared back office. Every tenant has exactly
// one is_primary property (seeded by migration 20260626000000_properties).
//
//   GET   /v1/properties            → the tenant's properties (primary first)
//   POST  /v1/properties            → create an additional site (+ its subdomain)
//   GET   /v1/properties/:id         → one property
//   PATCH /v1/properties/:id         → rename / update settings (partial)
//   POST  /v1/properties/:id/make-primary → flip which site is the tenant's primary
//
// Property is owned ABOVE every module — NOT module-gated (no requireModule),
// exactly like /v1/brand and /v1/tenant. The `properties` table is ENABLE+FORCE
// RLS, so reads/writes go through withTenant. `property_id` is NOT a security
// boundary — tenant_id (the RLS GUC) is; property scoping is application-tier
// (docs/49 §2).
//
// HOST MODEL (docs/49 §5): every property has a STABLE per-site
// `<slug>.<tenant>.sparx.zone` subdomain, minted at create time and never moved —
// a site's permanent address, so links to it never break. The bare
// `<tenant>.sparx.zone` is a separate primary ALIAS that FOLLOWS the primary:
// make-primary re-points it at the new primary and guarantees the demoted site
// its own per-site subdomain (so nothing becomes unreachable). Custom/purchased
// domains are attached explicitly per-site and are never reassigned here. The
// `domains` table is non-RLS, so its writes use the bare client / the withTenant
// tx without a policy concern; `host` is globally unique (the cross-tenant guard).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, withTenant, type TxClient } from '@wizeworks/db';
// Runtime import: `Prisma.DbNull` (clearing the brandOverride JSON column) is a
// value, plus the Update/JSON input shapes are used as types (cf. brand.ts).
import { Prisma } from '@prisma/client';
import { ok } from '@wizeworks/api-core/envelope';
import { notFound, conflict, validationError, paymentRequired } from '@wizeworks/api-core/errors';
import { requireRole } from '@wizeworks/api-core/auth';
import { isModuleEnabled } from '@wizeworks/auth';
import { ALL_MODULES, type ModuleSlug } from '@wizeworks/modules';
// Universal search (docs/39): a property IS a `site` entity. Re-index it after
// each write so ⌘K stays live; indexEntity never throws into the handler.
import { indexEntity } from '@wizeworks/events';
import { mintZoneHost, tenantZone } from '../../lib/domain.js';
import { PropertyBrandOverrideSchema, parseBrandOverride } from '../../lib/property-brand.js';

// A stable per-tenant property handle from a display name: lowercase, hyphenated,
// ≤63 chars. Mirrors the tenant slugify in @wizeworks/auth.
function slugifyProperty(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

interface PropertyView {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  isPrimary: boolean;
  status: string;
  settings: Record<string, unknown>;
  // Per-site brand override (docs/49 §3) — null = inherit the tenant brand.
  brandOverride: Record<string, unknown> | null;
  // Per-site disabled modules (docs/49 Slice F). Empty = all tenant-active modules on.
  moduleScope: string[];
  /**
   * How many pages this site has, on the LIST only.
   *
   * Present so a caller can tell an EMPTY site from a built one before it offers
   * to do something whole-site to it. A blueprint install swaps the whole site
   * (site-service `installSite`, `allowReplace: true`), which is right for a site
   * with nothing on it and is the loss of a year's work on one that is trading —
   * and the console offering that choice could not see the difference, so it
   * promised "your existing pages are left exactly as they are" either way.
   *
   * Undefined on the single-property GET rather than 0: absent means "not
   * counted here", and a defaulted 0 would read as "this site is empty", which
   * is the failure this field exists to end.
   */
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
}

function parseModuleScope(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function toView(
  row: {
    id: string;
    tenantId: string;
    slug: string;
    name: string;
    isPrimary: boolean;
    status: string;
    settings: unknown;
    brandOverride: unknown;
    moduleScope: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  pageCount?: number
): PropertyView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    name: row.name,
    isPrimary: row.isPrimary,
    status: row.status,
    settings:
      row.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {},
    brandOverride: parseBrandOverride(row.brandOverride),
    moduleScope: parseModuleScope(row.moduleScope),
    ...(pageCount === undefined ? {} : { pageCount }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const IdParam = z.object({ id: z.string().uuid() });

// Per-site module scope, DERIVED from @wizeworks/modules rather than re-typed.
//
// It used to be a hand-written copy under a comment saying it was "kept in step
// with ALL_MODULES", and it was not: `funnels` was added to the package and
// forgotten here, so it could not be scoped off for one site and the per-site
// toggle silently did nothing for it. That is the same failure the tenant-level
// list already suffered twice (`inventory`, `finance` — see lib/module-toggle),
// and it typechecks perfectly both times, because a `ModuleSlug[]` literal is
// never exhaustive over the union.
//
// `z.enum` wants a non-empty literal tuple and `ALL_MODULES` is a readonly array,
// so the shape is asserted here once. The assertion is safe by construction —
// the package's own type is `readonly ModuleSlug[]` — and it is the only place
// this list is written down.
const MODULE_SLUGS = ALL_MODULES as unknown as readonly [ModuleSlug, ...ModuleSlug[]];

// All fields optional → PATCH semantics. `slug` is intentionally immutable here
// (it's the stable per-tenant handle that anchors the subdomain host).
// `brandOverride` is the per-site brand override (docs/49 §3); send `null` to
// clear it (inherit the tenant brand) or a partial object to set it.
// `moduleScope` replaces the disabled-modules list entirely (full PUT semantics
// on the array).
// A per-site social link (docs/49 "full per-site brand"). `platform` is a known
// key or a free-text "Other" label; mirrors the tenant-level shape in tenant.ts.
const SocialLink = z.object({
  platform: z.string().min(1).max(40),
  url: z.string().min(1).max(2048),
});

// How a customer reaches this business — the phone number, the address to write
// to, and the place to turn up. Site-scoped for the same reason `socials` is: two
// unrelated businesses under one owner do not share a phone line.
//
// Every field is a plain string the business types once and the storefront binds
// as `site.identity.phone` / `.email` / `.address`. `address` is multi-line free
// text (a postal address is not a fixed set of fields worldwide), rendered with
// its line breaks preserved. Empty string clears a field — the resolver reads a
// blank as UNSET and leaves the authored content standing, so a starter site does
// not render an empty label where a phone number should be.
const SiteContact = z.object({
  phone: z.string().max(40).optional(),
  email: z.string().max(320).optional(),
  address: z.string().max(500).optional(),
});

const PatchProperty = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  // Per-site social links — stored in the settings bag under `socials` so they
  // need no schema column. Merged into existing settings (does not clobber other
  // keys). A present-but-empty array clears the site's own links.
  socials: z.array(SocialLink).max(50).optional(),
  // Per-site contact details — same storage rationale as `socials` above.
  contact: SiteContact.optional(),
  brandOverride: PropertyBrandOverrideSchema.nullable().optional(),
  moduleScope: z.array(z.enum(MODULE_SLUGS)).optional(),
});

// Create an additional site. `slug` optional → derived from the name. 'primary'
// is reserved for the tenant's primary property.
const CreateProperty = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63).optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync signature.
const propertiesRoutes: FastifyPluginAsync = async (app) => {
  // ─── Every write to a site leaves a record of who did it ───────────────
  //
  // The site IS the business a customer deals with: its name, its brand, which
  // modules it carries, whether it is the primary one. None of that was audited.
  // The ONLY `Property` rows in `audit_logs` came from the Builder's publish and
  // reset, so a site could be renamed, re-branded, promoted over another, or
  // DELETED, and nothing anywhere said who did it or what it had been called.
  //
  // Found by trying to answer a smaller question: another business's name was
  // sitting in a shop's brand override, and there was no way to find out how it
  // got there. Every settings change and every publish on that site was logged.
  // The change to the business's own NAME was not.
  //
  // `tenant.` rather than a module prefix, because a property is owned above
  // every module (see the header) — the same family as `tenant.industry.installed`.
  //
  // In the SAME transaction as the write it describes, so a rolled-back change
  // never leaves a log entry claiming it happened.
  const logSite = async (
    tx: TxClient,
    auth: { tenantId: string; actorId: string | null },
    verb: 'created' | 'updated' | 'made_primary' | 'deleted',
    propertyId: string,
    diff: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null = null
  ): Promise<void> => {
    await tx.auditLog.create({
      data: {
        tenantId: auth.tenantId,
        actorId: auth.actorId,
        actorType: auth.actorId ? 'user' : 'system',
        action: `tenant.site.${verb}`,
        entityType: 'Property',
        entityId: propertyId,
        diff: (diff ?? null) as never,
      },
    });
  };

  /** The one field in the brand override anybody ever comes looking for. The
   *  rest is colors and fonts; logging the whole blob on every save would bury
   *  the line that matters. */
  const businessNameOf = (override: unknown): string | null => {
    if (!override || typeof override !== 'object' || Array.isArray(override)) return null;
    const value = (override as Record<string, unknown>).businessName;
    return typeof value === 'string' ? value : null;
  };

  app.get('/v1/properties', async (request) => {
    const auth = requireRole(request, 'viewer');
    const [rows, pages] = await withTenant({ tenantId: auth.tenantId }, async (tx) => [
      await tx.property.findMany({ orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }),
      // ONE grouped count for every site, rather than a count per row: this list
      // is read on nearly every boot, and N+1 counts on a tenant with a dozen
      // sites would be a dozen round trips to answer "is this site empty".
      await tx.builderPage.groupBy({ by: ['propertyId'], _count: { _all: true } }),
    ]);
    // A site with no pages is absent from a groupBy, so it has to default to 0
    // HERE, where zero genuinely means "counted, and there are none".
    const countOf = new Map(pages.map((g) => [g.propertyId, g._count._all] as const));
    return ok(rows.map((row) => toView(row, countOf.get(row.id) ?? 0)));
  });

  // Create an additional web property (site). Mints its always-on
  // `<slug>.<tenant>.sparx.zone` subdomain so it's reachable immediately; the
  // Builder page tree + chrome are seeded lazily on first edit (listOrSeed).
  app.post('/v1/properties', async (request) => {
    const auth = requireRole(request, 'editor');
    const input = CreateProperty.parse(request.body);
    const slug = slugifyProperty(input.slug ?? input.name);
    if (!slug) {
      throw validationError('Name must contain letters or numbers.', [
        { field: 'name', message: 'Could not derive a URL handle.' },
      ]);
    }
    if (slug === 'primary') {
      throw validationError('”primary” is reserved for your main site.', [
        { field: 'slug', message: 'Choose a different handle.' },
      ]);
    }

    // Additional sites (beyond the one primary every tenant gets) require the
    // builder module. Gate here so the dashboard can surface a clean upsell.
    const existingCount = await prisma.property.count({ where: { tenantId: auth.tenantId } });
    if (existingCount >= 1) {
      const builderActive = await isModuleEnabled(auth.tenantId, 'builder');
      if (!builderActive) {
        throw paymentRequired('Additional sites require the Builder module.', {
          module: 'builder',
        });
      }
    }

    // Tenant slug anchors the subdomain host (`tenants` is non-RLS).
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { slug: true },
    });
    if (!tenant) throw notFound('Tenant', auth.tenantId);
    // The tenant's OWN zone, read off the subdomain it already has rather than
    // decided from its brand. A Piggles business adding a second site was
    // getting `<site>.<tenant>.sparx.zone` — one business with two sites in two
    // brands' zones, the second one named after a product it has never heard of.
    const host = mintZoneHost(tenant.slug, slug, false, await tenantZone(auth.tenantId));

    const row = await withTenant({ tenantId: auth.tenantId, userId: auth.actorId }, async (tx) => {
      // Slug unique per tenant (@@unique([tenantId, slug])).
      const clash = await tx.property.findFirst({ where: { slug }, select: { id: true } });
      if (clash) return { conflict: 'slug' as const };
      // Host is globally unique — another site (anywhere) may already hold it.
      const hostClash = await tx.domain.findUnique({ where: { host }, select: { id: true } });
      if (hostClash) return { conflict: 'host' as const };

      const property = await tx.property.create({
        data: { tenantId: auth.tenantId, slug, name: input.name, isPrimary: false },
      });
      await logSite(tx, auth, 'created', property.id, { after: { name: input.name, slug } });
      await tx.domain.create({
        data: {
          tenantId: auth.tenantId,
          propertyId: property.id,
          host,
          type: 'subdomain',
          status: 'active',
          isCanonical: true,
        },
      });
      return { property };
    });
    if ('conflict' in row) {
      if (row.conflict === 'slug') {
        throw conflict(`A site with the handle “${slug}” already exists.`, { field: 'slug' });
      }
      throw conflict('That subdomain is already taken. Pick a different handle.', {
        field: 'slug',
      });
    }
    await indexEntity({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      entityType: 'site',
      recordId: row.property.id,
    });
    return ok(toView(row.property));
  });

  app.get('/v1/properties/:id', async (request) => {
    const auth = requireRole(request, 'viewer');
    const { id } = IdParam.parse(request.params);
    const row = await withTenant({ tenantId: auth.tenantId }, (tx) =>
      tx.property.findUnique({ where: { id } })
    );
    if (!row) throw notFound('Property', id);
    return ok(toView(row));
  });

  app.patch('/v1/properties/:id', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = IdParam.parse(request.params);
    const input = PatchProperty.parse(request.body);

    // Only forward keys the caller actually sent (PATCH merge).
    const data: Prisma.PropertyUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.brandOverride !== undefined) {
      // object → set the override; null → Prisma.DbNull clears it (inherit the
      // tenant brand). The override is plain JSON (the `tokens` doc is unknown-
      // valued), so cast to InputJsonValue for the JSONB column.
      data.brandOverride = input.brandOverride
        ? (input.brandOverride as Prisma.InputJsonValue)
        : Prisma.DbNull;
    }
    if (input.moduleScope !== undefined) {
      data.moduleScope = input.moduleScope;
    }

    const row = await withTenant({ tenantId: auth.tenantId, userId: auth.actorId }, async (tx) => {
      // Scope the update to the tenant's own row; a missing id is a 404, not a
      // silent no-op (updateMany would hide it). Read the current settings so a
      // `socials`/`settings` patch MERGES into the bag rather than clobbering it.
      const existing = await tx.property.findUnique({
        where: { id },
        select: { id: true, settings: true, name: true, brandOverride: true, moduleScope: true },
      });
      if (!existing) return null;
      // settings, socials + contact all live in the settings JSON. Layer:
      // existing → caller's explicit `settings` (replace those keys) → the
      // caller's `socials`/`contact`.
      if (
        input.settings !== undefined ||
        input.socials !== undefined ||
        input.contact !== undefined
      ) {
        const base =
          existing.settings &&
          typeof existing.settings === 'object' &&
          !Array.isArray(existing.settings)
            ? (existing.settings as Record<string, unknown>)
            : {};
        const merged: Record<string, unknown> = { ...base, ...(input.settings ?? {}) };
        if (input.socials !== undefined) merged.socials = input.socials;
        // MERGED field-by-field, unlike socials: the identity surface sends the
        // whole contact block, but a caller patching only `phone` must not blank
        // the address it never mentioned.
        if (input.contact !== undefined) {
          const prior =
            base.contact && typeof base.contact === 'object' && !Array.isArray(base.contact)
              ? (base.contact as Record<string, unknown>)
              : {};
          merged.contact = { ...prior, ...input.contact };
        }
        data.settings = merged as Prisma.InputJsonValue;
      }
      const updated = await tx.property.update({ where: { id }, data });

      // Only what the caller actually sent. `settings` and the rest of the brand
      // override are big bags; they are recorded as "this changed" rather than
      // dumped, so the log stays readable and the identity fields stay findable.
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      if (input.name !== undefined) {
        before.name = existing.name;
        after.name = updated.name;
      }
      if (input.brandOverride !== undefined) {
        before.businessName = businessNameOf(existing.brandOverride);
        after.businessName = businessNameOf(updated.brandOverride);
        after.brandChanged = true;
      }
      if (input.moduleScope !== undefined) {
        before.moduleScope = existing.moduleScope;
        after.moduleScope = updated.moduleScope;
      }
      if (
        input.settings !== undefined ||
        input.socials !== undefined ||
        input.contact !== undefined
      ) {
        after.settingsChanged = true;
      }
      await logSite(tx, auth, 'updated', id, { before, after });

      return updated;
    });
    if (!row) throw notFound('Property', id);
    await indexEntity({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      entityType: 'site',
      recordId: id,
    });
    return ok(toView(row));
  });

  // Make this property the tenant's primary. Flips `is_primary` (dashboard
  // default + billing anchor) AND makes the bare `<tenant>.sparx.zone` host
  // follow the primary (docs/49 §5): it re-points to the new primary, and the
  // demoted site is guaranteed its own stable `<slug>.<tenant>.sparx.zone`
  // subdomain so it stays reachable. Per-site subdomains never move; only the
  // bare alias does. Custom/purchased domains are untouched. All in ONE tx so the
  // partial-unique `properties_one_primary_per_tenant` never sees two primaries.
  app.post('/v1/properties/:id/make-primary', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = IdParam.parse(request.params);

    // Tenant slug anchors every zone host (`tenants` is non-RLS). The bare host
    // is `<tenant>.<zone>` (mintZoneHost ignores the slug arg when
    // isPrimary=true), and the zone is the tenant's own — see the note on the
    // create path above.
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { slug: true },
    });
    if (!tenant) throw notFound('Tenant', auth.tenantId);
    const zone = await tenantZone(auth.tenantId);
    const bareHost = mintZoneHost(tenant.slug, 'primary', true, zone);

    const row = await withTenant({ tenantId: auth.tenantId, userId: auth.actorId }, async (tx) => {
      const target = await tx.property.findUnique({ where: { id } });
      if (!target) return null;
      if (target.isPrimary) return target; // already primary — no-op

      const prevPrimary = await tx.property.findFirst({
        where: { isPrimary: true },
        select: { id: true, slug: true },
      });

      // Flip the flag (clear the old primary first so the partial-unique index
      // never sees two).
      await tx.property.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
      const updated = await tx.property.update({ where: { id }, data: { isPrimary: true } });
      // Which site lost the bare address matters as much as which one gained it.
      await logSite(tx, auth, 'made_primary', id, {
        before: { primarySite: prevPrimary?.slug ?? null },
        after: { primarySite: updated.slug },
      });

      // (a) Guarantee the demoted site a stable per-site subdomain and make it
      //     that site's canonical (it's about to lose the bare host). Upsert by
      //     the globally-unique host so re-running make-primary is idempotent.
      if (prevPrimary) {
        const demotedHost = mintZoneHost(tenant.slug, prevPrimary.slug, false, zone);
        await tx.domain.upsert({
          where: { host: demotedHost },
          update: { propertyId: prevPrimary.id, status: 'active' },
          create: {
            tenantId: auth.tenantId,
            propertyId: prevPrimary.id,
            host: demotedHost,
            type: 'subdomain',
            status: 'active',
            isCanonical: false,
          },
        });
        // Sole canonical per property — clear-then-set, mirroring the
        // /v1/domains canonical route.
        await tx.domain.updateMany({
          where: { propertyId: prevPrimary.id, isCanonical: true },
          data: { isCanonical: false },
        });
        await tx.domain.update({ where: { host: demotedHost }, data: { isCanonical: true } });
      }

      // (b) Re-point the bare host to the new primary, creating it if it never
      //     existed (older tenant relying on the resolver's primary fallback).
      await tx.domain.upsert({
        where: { host: bareHost },
        update: { propertyId: updated.id, status: 'active' },
        create: {
          tenantId: auth.tenantId,
          propertyId: updated.id,
          host: bareHost,
          type: 'subdomain',
          status: 'active',
          isCanonical: false,
        },
      });
      // (c) New primary's sole canonical = the bare host (clear-then-set).
      await tx.domain.updateMany({
        where: { propertyId: updated.id, isCanonical: true },
        data: { isCanonical: false },
      });
      await tx.domain.update({ where: { host: bareHost }, data: { isCanonical: true } });

      return updated;
    });
    if (!row) throw notFound('Property', id);
    // The promoted site's "primary" subtitle changed; the demoted one self-heals
    // on its next write or a reindex.
    await indexEntity({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      entityType: 'site',
      recordId: id,
    });
    return ok(toView(row));
  });

  // Delete a site. Refuses the primary (make another primary first) — a tenant
  // must always have exactly one. The FK cascade removes the site's Builder
  // pages/layouts/assignments, its domains, and its Model B product/content
  // scope rows; the shared back office (products, content, orders) is untouched.
  app.delete('/v1/properties/:id', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = IdParam.parse(request.params);
    const result = await withTenant(
      { tenantId: auth.tenantId, userId: auth.actorId },
      async (tx) => {
        const existing = await tx.property.findUnique({
          where: { id },
          select: { id: true, isPrimary: true, name: true, slug: true },
        });
        if (!existing) return { error: 'not_found' as const };
        if (existing.isPrimary) return { error: 'primary' as const };
        await tx.property.delete({ where: { id } });
        // What it WAS. The row is gone and the cascade has taken its pages and
        // its domains with it, so the log is the only place left that can say
        // which site this used to be. `entity_id` carries no foreign key, so it
        // outlives the row it names.
        await logSite(tx, auth, 'deleted', id, {
          before: { name: existing.name, slug: existing.slug },
        });
        return { ok: true as const };
      }
    );
    if ('error' in result) {
      if (result.error === 'not_found') throw notFound('Property', id);
      throw conflict('You can’t delete your primary site. Make another site primary first.', {
        field: 'isPrimary',
      });
    }
    await indexEntity({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      entityType: 'site',
      recordId: id,
      op: 'delete',
    });
    return ok({ id });
  });
};

export default propertiesRoutes;
