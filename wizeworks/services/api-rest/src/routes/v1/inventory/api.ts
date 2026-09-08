// The DOCUMENTED public inventory API (docs/06 §7) — the contract-stable,
// simply-shaped surface external integrators code against with a scoped API key.
// Distinct from the dashboard-shaped routes (stock.ts / locations.ts): these are
// the four canonical endpoints the spec names, each enforcing the per-key scope
// (`read:inventory` / `write:inventory`) on top of the module + role gates.
//
//   GET   /v1/inventory               List inventory levels (cross-warehouse,
//                                     filterable by warehouse/product/variant/
//                                     low-stock/out-of-stock, sortable)
//   PATCH /v1/inventory/:variant_id   Set on-hand or apply a delta at a warehouse
//   POST  /v1/inventory/adjustments   Bulk adjustment (JSON or text/csv)
//   GET   /v1/inventory/alerts        Low-stock alerts
//
// A JWT (dashboard) actor bypasses the scope check — staff are gated by role;
// scopes are a per-API-key concept. Writes route through @wizeworks/inventory's
// ledger funnel (audited, concurrency-safe).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queryBool } from '@wizeworks/api-core/query';
import { inventoryService } from '@wizeworks/inventory';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { requireRole, requireScope } from '@wizeworks/api-core/auth';
import { requireInventoryModule, toInventoryContext } from '../../../lib/inventory-context.js';

const READ = 'read:inventory';
const WRITE = 'write:inventory';

const VariantParam = z.object({ variant_id: z.string().uuid() });

const ListQuery = z.object({
  warehouse_id: z.string().uuid().optional(),
  q: z.string().max(255).optional(),
  // Every level for ONE product in a single request — what a product-scoped
  // stock view reads. `q` is not a substitute: it matches product title as a
  // substring, so "Camp Mug" and "Camp Mug XL" come back together.
  product_id: z.string().uuid().optional(),
  // Every level for ONE variant — "this SKU, everywhere it is kept". The read a
  // variant-scoped stock view makes.
  variant_id: z.string().uuid().optional(),
  // Only what is at or below its reorder point, measured against SELLABLE stock
  // so the filter agrees with the "Running low" badge the surfaces render.
  low_stock_only: queryBool.optional(),
  // Only what has nothing left to sell. Distinct from `low_stock_only`, which
  // requires a reorder point and so answers nothing for an account that set
  // none — being OUT needs no policy to be true.
  out_of_stock_only: queryBool.optional(),
  // Only what a customer can still buy. Paired with `low_stock_only` it means
  // "running low but not yet gone", which is what the console badges "Running
  // low" — and it keeps the two counts disjoint for a caller adding them up.
  sellable_only: queryBool.optional(),
  sort_by: z.enum(['updatedAt', 'available', 'sku', 'product']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const UncountedQuery = z.object({
  q: z.string().min(1).optional(),
  product_id: z.string().uuid().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const AlertsQuery = z.object({
  warehouse_id: z.string().uuid().optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync signature
const inventoryApiRoutes: FastifyPluginAsync = async (app) => {
  // A bulk adjustment may arrive as a CSV upload — parse the raw text body for
  // this plugin's routes. JSON bodies still use the default parser.
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_req, body, done) => {
    done(null, { __csv: body });
  });

  // GET /v1/inventory — list levels across warehouses, enriched + paginated.
  app.get('/v1/inventory', async (request) => {
    await requireInventoryModule(request);
    requireScope(request, READ);
    requireRole(request, 'viewer');
    const q = ListQuery.parse(request.query);
    const take = q.take ?? 50;
    const skip = q.skip ?? 0;
    const { items, total } = await inventoryService.listInventory(toInventoryContext(request), {
      ...(q.warehouse_id ? { warehouseId: q.warehouse_id } : {}),
      ...(q.q ? { q: q.q } : {}),
      ...(q.product_id ? { productId: q.product_id } : {}),
      ...(q.variant_id ? { variantId: q.variant_id } : {}),
      ...(q.low_stock_only === true ? { lowStockOnly: true } : {}),
      ...(q.out_of_stock_only === true ? { outOfStockOnly: true } : {}),
      ...(q.sellable_only === true ? { sellableOnly: true } : {}),
      ...(q.sort_by ? { sortBy: q.sort_by } : {}),
      ...(q.order ? { order: q.order } : {}),
      take,
      skip,
    });
    return paged(items, { total, skip, per_page: take });
  });

  // GET /v1/inventory/uncounted — versions on sale that have NO level row.
  //
  // A separate route rather than a filter on the list above, because it is not
  // a list of the same thing: `/v1/inventory` reads stock POSITIONS and a
  // version nobody has counted does not have one. Registered before the
  // `:variant_id` route for the same reason as `/alerts`.
  app.get('/v1/inventory/uncounted', async (request) => {
    await requireInventoryModule(request);
    requireScope(request, READ);
    requireRole(request, 'viewer');
    const q = UncountedQuery.parse(request.query);
    const take = q.take ?? 50;
    const skip = q.skip ?? 0;
    const { items, total } = await inventoryService.listUncounted(toInventoryContext(request), {
      ...(q.q ? { q: q.q } : {}),
      ...(q.product_id ? { productId: q.product_id } : {}),
      take,
      skip,
    });
    return paged(items, { total, skip, per_page: take });
  });

  // GET /v1/inventory/alerts — variants at/below their reorder point.
  // Registered before the `:variant_id` route is matched by Fastify's static-
  // wins router, but kept explicit for readability.
  app.get('/v1/inventory/alerts', async (request) => {
    await requireInventoryModule(request);
    requireScope(request, READ);
    requireRole(request, 'viewer');
    const q = AlertsQuery.parse(request.query);
    return ok(
      await inventoryService.listLowStock(toInventoryContext(request), {
        ...(q.warehouse_id ? { warehouseId: q.warehouse_id } : {}),
        ...(q.take !== undefined ? { take: q.take } : {}),
      })
    );
  });

  // PATCH /v1/inventory/:variant_id — set an absolute on-hand or apply a delta
  // for one (variant, warehouse) level.
  app.patch('/v1/inventory/:variant_id', async (request) => {
    await requireInventoryModule(request);
    requireScope(request, WRITE);
    requireRole(request, 'editor');
    const { variant_id } = VariantParam.parse(request.params);
    return ok(
      await inventoryService.updateLevelCount(toInventoryContext(request), variant_id, request.body)
    );
  });

  // POST /v1/inventory/adjustments — bulk apply. Accepts JSON
  // `{ adjustments: [...] }` or a text/csv upload with sku/variant_id,
  // warehouse_id, on_hand/delta, reason?, note? columns.
  app.post('/v1/inventory/adjustments', async (request) => {
    await requireInventoryModule(request);
    requireScope(request, WRITE);
    requireRole(request, 'editor');
    const body = normalizeAdjustmentsBody(request.body);
    return ok(await inventoryService.bulkAdjust(toInventoryContext(request), body));
  });
};

// Turn the request body into the `{ adjustments: [...] }` shape bulkAdjust
// validates — passing a JSON body through, or parsing a CSV upload into rows.
function normalizeAdjustmentsBody(body: unknown): { adjustments: unknown[] } {
  if (body && typeof body === 'object' && '__csv' in body) {
    return { adjustments: parseAdjustmentsCsv((body as { __csv: string }).__csv) };
  }
  return body as { adjustments: unknown[] };
}

// Minimal CSV → row-object parser for the bulk endpoint. Maps the snake_case
// header columns to the camelCase row shape, coercing on_hand/delta to numbers
// and dropping empty cells so the schema's exactly-one-of refines apply. Handles
// quoted fields containing commas.
function parseAdjustmentsCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const headerLine = lines[0];
  if (lines.length < 2 || headerLine === undefined) return [];
  const header = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase());
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const cells = splitCsvLine(line);
    const raw: Record<string, string> = {};
    header.forEach((col, idx) => {
      raw[col] = (cells[idx] ?? '').trim();
    });
    const row: Record<string, unknown> = {};
    if (raw.sku) row.sku = raw.sku;
    if (raw.variant_id) row.variantId = raw.variant_id;
    if (raw.warehouse_id) row.warehouseId = raw.warehouse_id;
    if (raw.on_hand !== undefined && raw.on_hand !== '') row.onHand = Number(raw.on_hand);
    if (raw.delta !== undefined && raw.delta !== '') row.delta = Number(raw.delta);
    if (raw.reason) row.reason = raw.reason;
    if (raw.note) row.note = raw.note;
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export default inventoryApiRoutes;
