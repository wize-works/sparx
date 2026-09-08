// The universal scan resolver (docs/146 Phase 3.4).
//
// One function behind every scan-first workflow in the phase. A person in a
// warehouse points a gun at something and it is a product, a shelf, a purchase
// order, a transfer, a count sheet, a lot label or a serial plate — and they
// should not have to tell the software which, because they can already see it
// and the software can work it out.
//
// ── It returns MATCHES, plural, and does not guess ───────────────────────────
//
// A value can honestly be two things: a bin called "1001" and a SKU called
// "1001" can both exist, and inventing a precedence rule that silently picks one
// is how a scan puts stock on the wrong shelf. So this returns everything the
// value matched, ordered by how likely it is to be what was meant, and the
// caller decides — which in practice means the UI asks, once, and the person who
// is holding the thing answers in a second.
//
// ── Scoping is what makes it fast to use ─────────────────────────────────────
//
// A receiving screen passes `expect: ['variant', 'purchase_order', 'bin']`, so a
// scan that also happens to match a count sheet does not produce a question
// nobody wants asked. Narrow it wherever the workflow already knows.

import { Prisma, withTenant } from '@wizeworks/db';
import { normalizeBarcode, scanEquivalents } from '@wizeworks/commerce-schemas';

import type { ServiceContext } from '../errors';

/** Everything a scan can be. Ordered as the resolver ranks them. */
export type ScanKind =
  'variant' | 'bin' | 'purchase_order' | 'goods_receipt' | 'transfer' | 'count' | 'lot' | 'serial';

interface ScanMatchBase {
  kind: ScanKind;
  /** Entity id — what the caller navigates to or acts on. */
  id: string;
  /** What to show: the SKU, the shelf code, the PO number. */
  code: string;
  /** The human line under it: product name, warehouse, supplier, status. */
  title: string;
  /** Extra context worth a badge — a status, a location, a quantity. */
  detail: string | null;
  /**
   * How the value matched. `exact` means the stored value is character-for-
   * character what was scanned; `equivalent` means it matched through a
   * symbology reading (a UPC-E expanded, a UPC-A read as EAN-13). Ranked
   * accordingly, and worth showing — "read as 012345000065" saves an argument.
   */
  via: 'exact' | 'equivalent';
}

export interface VariantScanMatch extends ScanMatchBase {
  kind: 'variant';
  variantId: string;
  productId: string;
  /** Base units this one scan represents. A case code is the reason this exists. */
  packSize: number;
  barcodeId: string | null;
  /** Set when the code that matched belongs to a supplier rather than to us. */
  supplierId: string | null;
  /** Total on hand across every location — the first thing anyone wants to know. */
  onHand: number;
}

export interface BinScanMatch extends ScanMatchBase {
  kind: 'bin';
  warehouseId: string;
  warehouseName: string;
  isSellable: boolean;
  unitCount: number;
}

export interface DocumentScanMatch extends ScanMatchBase {
  kind: 'purchase_order' | 'goods_receipt' | 'transfer' | 'count';
  status: string;
}

export interface LotScanMatch extends ScanMatchBase {
  kind: 'lot';
  variantId: string;
  warehouseId: string;
  quantity: number;
  expiresAt: string | null;
  recallStatus: string | null;
}

export interface SerialScanMatch extends ScanMatchBase {
  kind: 'serial';
  variantId: string;
  warehouseId: string;
  status: string;
}

export type ScanMatch =
  VariantScanMatch | BinScanMatch | DocumentScanMatch | LotScanMatch | SerialScanMatch;

export interface ResolveScanOptions {
  /** Restrict to the kinds this workflow can act on. Omit for everything. */
  expect?: ScanKind[];
  /** Limit bins, lots and serials to one location — the warehouse mode is in. */
  warehouseId?: string;
}

export interface ScanResolution {
  /** The value as normalized, which is what everything below was matched against. */
  scanned: string;
  matches: ScanMatch[];
}

const ALL_KINDS: ScanKind[] = [
  'variant',
  'bin',
  'purchase_order',
  'goods_receipt',
  'transfer',
  'count',
  'lot',
  'serial',
];

export async function resolveScan(
  ctx: ServiceContext,
  raw: string,
  options: ResolveScanOptions = {}
): Promise<ScanResolution> {
  const scanned = normalizeBarcode(raw);
  if (scanned.length === 0) return { scanned, matches: [] };

  const wanted = new Set(options.expect?.length ? options.expect : ALL_KINDS);
  // The symbology readings only apply to product codes. A purchase order number
  // is not a GTIN and adding a leading zero to it would match nothing but could
  // in principle match the WRONG document, so document lookups use the literal.
  const equivalents = scanEquivalents(scanned);

  return withTenant(ctx, async (tx) => {
    const matches: ScanMatch[] = [];

    if (wanted.has('variant')) {
      // "How many are there" means "here" when the scan happened in a location.
      const levelScope = options.warehouseId
        ? Prisma.sql`AND l.warehouse_id = ${options.warehouseId}::uuid`
        : Prisma.empty;
      const rows = await tx.$queryRaw<
        {
          barcodeId: string | null;
          value: string;
          packSize: number;
          supplierId: string | null;
          variantId: string;
          productId: string;
          sku: string;
          productTitle: string;
          variantTitle: string | null;
          onHand: number;
        }[]
      >`
        -- Two ways a product can match: a registered barcode, or its SKU typed
        -- or printed as a Code 128. The SKU path matters because plenty of
        -- tenants already print their own SKU labels, and telling them those do
        -- not work until every code is re-registered is how the feature goes
        -- unused.
        WITH hits AS (
          SELECT bc.id AS barcode_id, bc.value AS value, bc.pack_size, bc.supplier_id,
                 v.id AS variant_id, v.product_id, v.sku, v.title AS variant_title,
                 (bc.value = ${scanned}) AS exact
            FROM commerce_variant_barcodes bc
            JOIN commerce_product_variants v ON v.id = bc.variant_id
           WHERE bc.tenant_id = ${ctx.tenantId}::uuid
             AND bc.value = ANY(${equivalents}::text[])
             AND v.deleted_at IS NULL
          UNION ALL
          SELECT NULL, v.sku, 1, NULL,
                 v.id, v.product_id, v.sku, v.title, true
            FROM commerce_product_variants v
           WHERE v.tenant_id = ${ctx.tenantId}::uuid
             AND v.deleted_at IS NULL
             AND upper(v.sku) = upper(${scanned})
        )
        SELECT DISTINCT ON (h.variant_id)
               h.barcode_id                  AS "barcodeId",
               h.value                       AS "value",
               h.pack_size                   AS "packSize",
               h.supplier_id                 AS "supplierId",
               h.variant_id                  AS "variantId",
               h.product_id                  AS "productId",
               h.sku                         AS "sku",
               p.title                       AS "productTitle",
               h.variant_title               AS "variantTitle",
               COALESCE(lv.on_hand, 0)::int  AS "onHand",
               h.exact                       AS "exact"
          FROM hits h
          JOIN commerce_products p ON p.id = h.product_id
          LEFT JOIN LATERAL (
            SELECT SUM(l.on_hand)::int AS on_hand
              FROM inventory_levels l
             WHERE l.tenant_id = ${ctx.tenantId}::uuid
               AND l.variant_id = h.variant_id
               ${levelScope}
          ) lv ON TRUE
         ORDER BY h.variant_id, h.exact DESC, h.barcode_id NULLS LAST
         LIMIT 10
      `;
      for (const r of rows) {
        matches.push({
          kind: 'variant',
          id: r.variantId,
          code: r.sku,
          title: r.productTitle,
          detail: r.variantTitle,
          via: r.value === scanned ? 'exact' : 'equivalent',
          variantId: r.variantId,
          productId: r.productId,
          packSize: r.packSize,
          barcodeId: r.barcodeId,
          supplierId: r.supplierId,
          onHand: r.onHand,
        });
      }
    }

    if (wanted.has('bin')) {
      const rows = await tx.$queryRaw<
        {
          id: string;
          code: string;
          name: string | null;
          warehouseId: string;
          warehouseName: string;
          isSellable: boolean;
          unitCount: number;
        }[]
      >`
        SELECT b.id            AS "id",
               b.code          AS "code",
               b.name          AS "name",
               b.warehouse_id  AS "warehouseId",
               w.name          AS "warehouseName",
               b.is_sellable   AS "isSellable",
               COALESCE((SELECT SUM(bl.on_hand)::int FROM inventory_bin_levels bl
                          WHERE bl.bin_id = b.id), 0) AS "unitCount"
          FROM inventory_bins b
          JOIN inventory_warehouses w ON w.id = b.warehouse_id
         WHERE b.tenant_id = ${ctx.tenantId}::uuid
           AND upper(b.code) = upper(${scanned})
           AND b.deleted_at IS NULL
           AND b.is_active = true
         ORDER BY w.name ASC
         LIMIT 10
      `;
      for (const r of rows) {
        if (options.warehouseId && r.warehouseId !== options.warehouseId) continue;
        matches.push({
          kind: 'bin',
          id: r.id,
          code: r.code,
          title: r.name ?? r.warehouseName,
          detail: `${r.unitCount} unit${r.unitCount === 1 ? '' : 's'} · ${r.warehouseName}`,
          via: 'exact',
          warehouseId: r.warehouseId,
          warehouseName: r.warehouseName,
          isSellable: r.isSellable,
          unitCount: r.unitCount,
        });
      }
    }

    // Documents. One query per kind rather than a UNION, because each carries a
    // different second line and the readability is worth four cheap indexed
    // lookups on a value that has already failed the product path.
    // A goods receipt has NO status column, and that is correct rather than an
    // omission: a receipt is a record of something that already happened, not a
    // document with a lifecycle. It reports 'received' so the caller does not
    // have to special-case one of the four.
    const documents: {
      kind: DocumentScanMatch['kind'];
      table: string;
      label: string;
      statusExpr: string;
    }[] = [
      {
        kind: 'purchase_order',
        table: 'inventory_purchase_orders',
        label: 'Purchase order',
        statusExpr: 'status',
      },
      {
        kind: 'goods_receipt',
        table: 'inventory_goods_receipts',
        label: 'Goods receipt',
        statusExpr: `'received'`,
      },
      {
        kind: 'transfer',
        table: 'inventory_transfers',
        label: 'Transfer',
        statusExpr: 'status',
      },
      { kind: 'count', table: 'inventory_counts', label: 'Stock count', statusExpr: 'status' },
    ];
    for (const doc of documents) {
      if (!wanted.has(doc.kind)) continue;
      const rows = await tx.$queryRawUnsafe<{ id: string; number: string; status: string }[]>(
        `SELECT id, number, ${doc.statusExpr} AS status FROM ${doc.table}
          WHERE tenant_id = $1::uuid AND upper(number) = upper($2) LIMIT 5`,
        ctx.tenantId,
        scanned
      );
      for (const r of rows) {
        matches.push({
          kind: doc.kind,
          id: r.id,
          code: r.number,
          title: doc.label,
          detail: r.status,
          via: 'exact',
          status: r.status,
        });
      }
    }

    if (wanted.has('lot')) {
      const rows = await tx.$queryRaw<
        {
          id: string;
          lotNumber: string;
          variantId: string;
          warehouseId: string;
          sku: string;
          quantity: number;
          expiresAt: Date | null;
          recallStatus: string | null;
        }[]
      >`
        SELECT lb.id           AS "id",
               lb.lot_number   AS "lotNumber",
               lb.variant_id   AS "variantId",
               lb.warehouse_id AS "warehouseId",
               v.sku           AS "sku",
               lb.quantity     AS "quantity",
               lb.expires_at   AS "expiresAt",
               lb.recall_status AS "recallStatus"
          FROM inventory_lot_batches lb
          JOIN commerce_product_variants v ON v.id = lb.variant_id
         WHERE lb.tenant_id = ${ctx.tenantId}::uuid
           AND upper(lb.lot_number) = upper(${scanned})
         LIMIT 10
      `;
      for (const r of rows) {
        if (options.warehouseId && r.warehouseId !== options.warehouseId) continue;
        matches.push({
          kind: 'lot',
          id: r.id,
          code: r.lotNumber,
          title: `Lot of ${r.sku}`,
          detail: r.recallStatus ? `Recall: ${r.recallStatus}` : `${r.quantity} on hand`,
          via: 'exact',
          variantId: r.variantId,
          warehouseId: r.warehouseId,
          quantity: r.quantity,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          recallStatus: r.recallStatus,
        });
      }
    }

    if (wanted.has('serial')) {
      const rows = await tx.$queryRaw<
        {
          id: string;
          serial: string;
          variantId: string;
          warehouseId: string;
          sku: string;
          status: string;
        }[]
      >`
        SELECT su.id           AS "id",
               su.serial       AS "serial",
               su.variant_id   AS "variantId",
               su.warehouse_id AS "warehouseId",
               v.sku           AS "sku",
               su.status       AS "status"
          FROM inventory_serial_units su
          JOIN commerce_product_variants v ON v.id = su.variant_id
         WHERE su.tenant_id = ${ctx.tenantId}::uuid
           AND upper(su.serial) = upper(${scanned})
         LIMIT 10
      `;
      for (const r of rows) {
        if (options.warehouseId && r.warehouseId !== options.warehouseId) continue;
        matches.push({
          kind: 'serial',
          id: r.id,
          code: r.serial,
          title: `Unit of ${r.sku}`,
          detail: r.status,
          via: 'exact',
          variantId: r.variantId,
          warehouseId: r.warehouseId,
          status: r.status,
        });
      }
    }

    // Rank: what was scanned literally beats a symbology reading, and a product
    // beats a document, because pointing a gun at a thing is overwhelmingly more
    // common than pointing it at a piece of paper.
    const kindRank = new Map(ALL_KINDS.map((k, i) => [k, i]));
    matches.sort((a, b) => {
      if (a.via !== b.via) return a.via === 'exact' ? -1 : 1;
      return (kindRank.get(a.kind) ?? 99) - (kindRank.get(b.kind) ?? 99);
    });

    // Scan telemetry, best-effort: it records that a registered code was used,
    // which is what decides whether an old label can be retired. Never blocks a
    // scan — if this fails the person still gets their answer.
    const variantHit = matches.find(
      (m): m is VariantScanMatch => m.kind === 'variant' && m.barcodeId !== null
    );
    if (variantHit?.barcodeId) {
      await tx.$executeRaw`
        UPDATE commerce_variant_barcodes
           SET scan_count = scan_count + 1, last_scanned_at = now()
         WHERE tenant_id = ${ctx.tenantId}::uuid AND id = ${variantHit.barcodeId}::uuid
      `;
    }

    return { scanned, matches };
  });
}
