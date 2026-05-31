// Tenant brand — the platform-wide source of truth for brand identity
// (docs/30 §6). Business name, logo (light/dark), favicon, core palette,
// typography, tagline, socials.
//
//   GET   /v1/brand   → current brand (defaults when unset)
//   PATCH /v1/brand   → upsert (partial)
//
// Brand is owned ABOVE every module — it is NOT module-gated (no
// requireModule), exactly like /v1/tenant. Email, CRM, PDFs and the
// storefront theme all READ it; none may override it (§6.2). The one-row-
// per-tenant `tenant_brands` table is ENABLE+FORCE RLS, so reads/writes go
// through withTenant (unlike the RLS-exempt tenants table that tenant.ts
// touches via the bare client).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withTenant, type Prisma } from '@sparx/db';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';

const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX, 'Use a 6-digit hex colour, e.g. #6366F1');

// All fields optional → PATCH semantics. A field present-but-null clears it;
// a field absent leaves it untouched.
const PatchBrand = z.object({
  businessName: z.string().max(255).nullable().optional(),
  tagline: z.string().max(255).nullable().optional(),
  logoLightMediaId: z.string().uuid().nullable().optional(),
  logoDarkMediaId: z.string().uuid().nullable().optional(),
  faviconMediaId: z.string().uuid().nullable().optional(),
  colorPrimary: hex.nullable().optional(),
  colorPrimaryForeground: hex.nullable().optional(),
  colorAccent: hex.nullable().optional(),
  fontHeading: z.string().max(127).nullable().optional(),
  fontBody: z.string().max(127).nullable().optional(),
  socials: z.record(z.string().max(40), z.string().max(2048)).optional(),
});

interface BrandView {
  tenantId: string;
  businessName: string | null;
  tagline: string | null;
  logoLightMediaId: string | null;
  logoDarkMediaId: string | null;
  faviconMediaId: string | null;
  colorPrimary: string | null;
  colorPrimaryForeground: string | null;
  colorAccent: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  socials: Record<string, string>;
}

function toView(
  tenantId: string,
  row: {
    businessName: string | null;
    tagline: string | null;
    logoLightMediaId: string | null;
    logoDarkMediaId: string | null;
    faviconMediaId: string | null;
    colorPrimary: string | null;
    colorPrimaryForeground: string | null;
    colorAccent: string | null;
    fontHeading: string | null;
    fontBody: string | null;
    socials: unknown;
  } | null
): BrandView {
  const socials =
    row?.socials && typeof row.socials === 'object' && !Array.isArray(row.socials)
      ? (row.socials as Record<string, string>)
      : {};
  return {
    tenantId,
    businessName: row?.businessName ?? null,
    tagline: row?.tagline ?? null,
    logoLightMediaId: row?.logoLightMediaId ?? null,
    logoDarkMediaId: row?.logoDarkMediaId ?? null,
    faviconMediaId: row?.faviconMediaId ?? null,
    colorPrimary: row?.colorPrimary ?? null,
    colorPrimaryForeground: row?.colorPrimaryForeground ?? null,
    colorAccent: row?.colorAccent ?? null,
    fontHeading: row?.fontHeading ?? null,
    fontBody: row?.fontBody ?? null,
    socials,
  };
}

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync signature.
const brandRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/brand', async (request) => {
    const auth = requireRole(request, 'viewer');
    const row = await withTenant({ tenantId: auth.tenantId }, (tx) =>
      tx.tenantBrand.findUnique({ where: { tenantId: auth.tenantId } })
    );
    return ok(toView(auth.tenantId, row));
  });

  app.patch('/v1/brand', async (request) => {
    const auth = requireRole(request, 'editor');
    const input = PatchBrand.parse(request.body);

    // Only forward keys the caller actually sent (PATCH merge).
    const data: Prisma.TenantBrandUncheckedUpdateInput = {};
    if (input.businessName !== undefined) data.businessName = input.businessName;
    if (input.tagline !== undefined) data.tagline = input.tagline;
    if (input.logoLightMediaId !== undefined) data.logoLightMediaId = input.logoLightMediaId;
    if (input.logoDarkMediaId !== undefined) data.logoDarkMediaId = input.logoDarkMediaId;
    if (input.faviconMediaId !== undefined) data.faviconMediaId = input.faviconMediaId;
    if (input.colorPrimary !== undefined) data.colorPrimary = input.colorPrimary;
    if (input.colorPrimaryForeground !== undefined)
      data.colorPrimaryForeground = input.colorPrimaryForeground;
    if (input.colorAccent !== undefined) data.colorAccent = input.colorAccent;
    if (input.fontHeading !== undefined) data.fontHeading = input.fontHeading;
    if (input.fontBody !== undefined) data.fontBody = input.fontBody;
    if (input.socials !== undefined) data.socials = input.socials;

    const row = await withTenant({ tenantId: auth.tenantId, userId: auth.actorId }, (tx) =>
      tx.tenantBrand.upsert({
        where: { tenantId: auth.tenantId },
        create: { tenantId: auth.tenantId, ...data } as Prisma.TenantBrandUncheckedCreateInput,
        update: data,
      })
    );
    return ok(toView(auth.tenantId, row));
  });
};

export default brandRoutes;
