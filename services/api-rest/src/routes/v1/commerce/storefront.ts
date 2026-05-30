// Commerce — storefront settings + reporting (revenue, top products, etc).

import type { FastifyPluginAsync } from 'fastify';
import { reportingService, storefrontService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const storefrontRoutes: FastifyPluginAsync = async (app) => {
  // Storefront settings
  app.get('/v1/commerce/storefront/settings', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await storefrontService.getSettings(toCommerceContext(request)));
  });

  app.patch('/v1/commerce/storefront/settings', async (request) => {
    requireRole(request, 'admin');
    await requireCommerceModule(request);
    await storefrontService.updateSettings(toCommerceContext(request), request.body);
    return ok({ updated: true });
  });

  app.get('/v1/commerce/storefront/theme', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await storefrontService.getTheme(toCommerceContext(request)));
  });

  app.patch('/v1/commerce/storefront/theme', async (request) => {
    requireRole(request, 'admin');
    await requireCommerceModule(request);
    await storefrontService.updateTheme(toCommerceContext(request), request.body);
    return ok({ updated: true });
  });

  // Reporting
  app.get('/v1/commerce/reports/revenue-summary', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await reportingService.revenueSummary(toCommerceContext(request), {
        from: q?.from ? new Date(q.from) : undefined,
        to: q?.to ? new Date(q.to) : undefined,
        groupBy: q?.group_by as never,
      })
    );
  });

  app.get('/v1/commerce/reports/top-products', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await reportingService.topProducts(toCommerceContext(request), {
        from: q?.from ? new Date(q.from) : undefined,
        to: q?.to ? new Date(q.to) : undefined,
        take: q?.take ? Number(q.take) : undefined,
      })
    );
  });

  app.get('/v1/commerce/reports/top-customers', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await reportingService.topCustomers(toCommerceContext(request), {
        from: q?.from ? new Date(q.from) : undefined,
        to: q?.to ? new Date(q.to) : undefined,
        take: q?.take ? Number(q.take) : undefined,
      })
    );
  });

  app.get('/v1/commerce/reports/conversion-funnel', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await reportingService.conversionFunnel(toCommerceContext(request), {
        from: q?.from ? new Date(q.from) : undefined,
        to: q?.to ? new Date(q.to) : undefined,
      })
    );
  });

  app.get('/v1/commerce/reports/abandoned-carts', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await reportingService.abandonedCarts(toCommerceContext(request), {
        from: q?.from ? new Date(q.from) : undefined,
        to: q?.to ? new Date(q.to) : undefined,
      })
    );
  });

  app.get('/v1/commerce/reports/subscription-metrics', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await reportingService.subscriptionMetrics(toCommerceContext(request)));
  });

  app.get('/v1/commerce/reports/inventory-valuation', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await reportingService.inventoryValuation(toCommerceContext(request)));
  });
};

export default storefrontRoutes;
