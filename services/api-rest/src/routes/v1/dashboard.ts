// Dashboard home — per-module summary metrics for the (dashboard)/page.tsx
// active-modules grid. One round trip for everything the home cards need.
//
//   GET /v1/dashboard/home   → { modules: [{slug, enabled, metric}] }
//
// Metrics only resolve for modules with real backing data today (CMS pages,
// CRM customers). The rest return null — the dashboard renders an em-dash
// rather than claiming "0 of X".

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '@sparx/db';
import { ok } from '@sparx/api-core/envelope';
import { requireAuth } from '@sparx/api-core/auth';
import { type ModuleSlug } from '@sparx/auth';

const MODULE_SLUGS: ModuleSlug[] = [
  'storefront',
  'commerce',
  'cms',
  'crm',
  'email',
  'b2b',
  'dropship',
  'ai',
];

function readModuleFlags(settings: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const slug of MODULE_SLUGS) out[slug] = false;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return out;
  const modules = (settings as Record<string, unknown>).modules;
  if (!modules || typeof modules !== 'object') return out;
  for (const slug of MODULE_SLUGS) {
    const slot = (modules as Record<string, unknown>)[slug];
    if (slot && typeof slot === 'object' && (slot as Record<string, unknown>).enabled === true) {
      out[slug] = true;
    }
  }
  return out;
}

async function loadMetric(tenantId: string, slug: ModuleSlug): Promise<string | null> {
  switch (slug) {
    case 'cms': {
      const n = await prisma.page.count({ where: { tenantId } });
      return `${n} ${n === 1 ? 'page' : 'pages'}`;
    }
    case 'crm': {
      const n = await prisma.customer.count({ where: { tenantId, deletedAt: null } });
      return `${n} ${n === 1 ? 'customer' : 'customers'}`;
    }
    default:
      return null;
  }
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/dashboard/home', async (request) => {
    const auth = requireAuth(request);
    const tenant = await prisma.tenant.findUnique({
      where: { id: auth.tenantId },
      select: { settings: true },
    });
    const flags = readModuleFlags(tenant?.settings ?? null);

    const modules = await Promise.all(
      MODULE_SLUGS.map(async (slug) => ({
        slug,
        enabled: flags[slug] === true,
        metric: flags[slug] === true ? await loadMetric(auth.tenantId, slug) : null,
      }))
    );

    return ok({ modules });
  });
};

export default dashboardRoutes;
