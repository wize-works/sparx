// Dev seed — idempotent: re-running upserts in place, so it's safe to call
// `pnpm --filter @wizeworks/db db:seed` repeatedly.
//
// Creates the "WizeWorks LLC" dogfood tenant (slug `wizeworks`, matching the
// prod platform tenant) with one staff user
// (e2e-staff@sparx.test / e2e-test-password) — these credentials are baked
// into Playwright tests and any local dashboard smoke test. The password hash
// is produced by Better Auth's own hasher (scrypt, via better-auth/crypto) so
// the seeded credential row verifies against the live sign-in flow.

import { randomUUID } from 'node:crypto';

import { PrismaClient, type Prisma } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { blankPageTree } from '@wizeworks/builder-schemas';
import { collectionDetailPage, productDetailPage } from '@wizeworks/silica-catalog';
import { getFitmentDictionary, planFitmentDictionaryRows } from '@wizeworks/commerce-schemas';

import { seedPlatformData } from './platform-seed.js';

const prisma = new PrismaClient();

// Dev dogfood tenant — slug matches the prod platform tenant (`wizeworks`) so
// first-party surfaces (/careers, /early) resolve to the same slug in both envs.
const TENANT_SLUG = 'wizeworks';
const STAFF_EMAIL = 'e2e-staff@sparx.test';
const STAFF_PASSWORD = 'e2e-test-password';

// ─────────────────────────────────────────────────────────────────────────────
// Demo inventory (docs/100 P1e) — a focused diesel-parts catalog (the Gillett
// anchor vertical) + multi-warehouse stock so the Inventory module renders real
// numbers locally: non-zero valuation, a low/out-of-stock watch list, and a
// populated movement-ledger activity feed. Stock is written the way
// `applyMovement()` does — every level gets opening movements whose Σ(delta)
// equals on_hand, with a running `balance_after` — so the ledger invariant
// (`onHand == Σ(movements)`) holds and the feed reads like real activity. The
// products double as a small commerce catalog for the seeded tenant.
//
// Idempotent: demo products (handle `inv-demo-*`) are dropped + recreated each
// run, cascading their variants/levels/movements/lots; warehouses upsert by code.
// FORCE-RLS tables, so the whole thing runs inside one tx with app.tenant_id SET
// LOCAL (wizeworks/packages/db/CLAUDE.md).

type DemoWh = 'MAIN' | 'WEST-3PL';

interface DemoMovement {
  delta: number;
  reason: string; // receive | sale | recount | transfer_in | loss | damage
  daysAgo: number;
}
interface DemoLevel {
  warehouse: DemoWh;
  reorderPoint?: number;
  reorderQuantity?: number;
  leadTimeDays?: number;
  movements: DemoMovement[]; // Σ(delta) == on_hand for this level
}
interface DemoVariant {
  sku: string;
  title: string | null;
  priceCents: number;
  costCents: number;
  levels: DemoLevel[];
}
interface DemoProduct {
  handle: string;
  title: string;
  productType: string;
  vendor: string;
  hazmatClass?: string;
  // Typed product attributes (docs/143) — the demo parts catalog is `auto_part`, so the
  // seed exercises the new structure end-to-end (a PDP renders real fitment/specs/warranty).
  attributes?: {
    fitment: string;
    specs: { label: string; value: string }[];
    warranty: string;
  };
  variants: DemoVariant[];
}
interface DemoLot {
  sku: string;
  warehouse: DemoWh;
  lotNumber: string;
  quantity: number;
  expiresInDays: number | null;
  hazmatClass?: string;
  recall?: string; // reason → an active recall
}

const DEMO_WAREHOUSES: {
  code: string;
  name: string;
  type: string;
  city: string;
  region: string;
}[] = [
  { code: 'MAIN', name: 'Main Warehouse', type: 'owned', city: 'West Valley City', region: 'UT' },
  { code: 'WEST-3PL', name: 'West Coast 3PL', type: '3pl', city: 'Reno', region: 'NV' },
];

// `r(n, d)` = receive n then sell d (chronologically), so on_hand = n − d but the
// level carries real ledger history. Single receives are the common case.
const recv = (delta: number, daysAgo: number): DemoMovement => ({
  delta,
  reason: 'receive',
  daysAgo,
});
const sale = (delta: number, daysAgo: number): DemoMovement => ({
  delta: -delta,
  reason: 'sale',
  daysAgo,
});

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    handle: 'inv-demo-fuel-filter-67',
    title: 'Fuel Filter — 6.7L Power Stroke',
    productType: 'Filters',
    attributes: {
      fitment:
        'Fits 2011–2016 Ford 6.7L Power Stroke diesel. Direct OE replacement for the primary/secondary fuel-filter service kit; no adapter required.',
      specs: [
        { label: 'Micron rating', value: '5 micron' },
        { label: 'Style', value: 'Spin-on cartridge' },
        { label: 'Water separator', value: 'Yes' },
        { label: 'Service interval', value: '15,000 mi' },
      ],
      warranty:
        '12-month / 12,000-mile limited replacement warranty against defects in material and workmanship.',
    },
    vendor: 'Motorcraft',
    variants: [
      {
        sku: 'FF-67-STD',
        title: 'Standard',
        priceCents: 4299,
        costCents: 2150,
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 24,
            reorderQuantity: 96,
            leadTimeDays: 7,
            movements: [
              recv(120, 21),
              sale(15, 9),
              sale(9, 3),
              { delta: -1, reason: 'recount', daysAgo: 1 },
            ],
          },
          {
            warehouse: 'WEST-3PL',
            reorderPoint: 12,
            reorderQuantity: 48,
            movements: [recv(40, 18), sale(6, 5)],
          },
        ],
      },
      {
        sku: 'FF-67-OEM',
        title: 'OEM',
        priceCents: 5899,
        costCents: 3100,
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 16,
            reorderQuantity: 64,
            leadTimeDays: 10,
            movements: [recv(58, 30), sale(22, 6)],
          },
        ],
      },
    ],
  },
  {
    handle: 'inv-demo-glow-plug-60',
    title: 'Glow Plug Set (8) — 6.0L Power Stroke',
    productType: 'Ignition',
    attributes: {
      fitment:
        'Fits 2003–2007 Ford 6.0L Power Stroke diesel. Complete set of 8 — one per cylinder. Torque to 15 lb-ft on install.',
      specs: [
        { label: 'Set quantity', value: '8 plugs' },
        { label: 'Voltage', value: '12 V' },
        { label: 'Tip', value: 'Dual-coil, fast-start' },
        { label: 'Thread', value: 'M8 × 1.0' },
      ],
      warranty:
        '24-month / unlimited-mile limited warranty; a failed plug is replaced free within the period.',
    },
    vendor: 'Motorcraft',
    variants: [
      {
        sku: 'GP-60-SET8',
        title: null,
        priceCents: 18999,
        costCents: 9800,
        // Low: 7 on hand, reorder point 10.
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 10,
            reorderQuantity: 40,
            leadTimeDays: 14,
            movements: [recv(28, 24), sale(13, 8), sale(8, 2)],
          },
        ],
      },
    ],
  },
  {
    handle: 'inv-demo-injector-67-cummins',
    title: 'Fuel Injector — 6.7L Cummins',
    productType: 'Fuel System',
    attributes: {
      fitment:
        'Fits 2007.5–2018 Dodge/Ram 6.7L Cummins common-rail. Sold each; a full set is six. Requires injector-return and high-pressure line reseal on install.',
      specs: [
        { label: 'Type', value: 'Common-rail piezo' },
        { label: 'Flow', value: 'Stock (100%)' },
        { label: 'Max pressure', value: '26,000 psi' },
        { label: 'Coding', value: 'Requires IQA re-flash' },
      ],
      warranty:
        'Remanufactured to OE spec; 18-month / unlimited-mile warranty. Core charge refunded on return of the old unit.',
    },
    vendor: 'Bosch',
    variants: [
      {
        sku: 'INJ-67C-REMAN',
        title: 'Remanufactured',
        priceCents: 32900,
        costCents: 18500,
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 8,
            reorderQuantity: 24,
            leadTimeDays: 21,
            movements: [recv(36, 40), sale(11, 12), sale(7, 4)],
          },
        ],
      },
      {
        sku: 'INJ-67C-NEW',
        title: 'New OEM',
        priceCents: 58900,
        costCents: 41000,
        // Out of stock with history: received then fully sold through.
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 4,
            reorderQuantity: 12,
            leadTimeDays: 28,
            movements: [recv(9, 35), sale(9, 6)],
          },
        ],
      },
    ],
  },
  {
    handle: 'inv-demo-turbo-lml',
    title: 'Turbocharger — Duramax LML',
    productType: 'Forced Induction',
    attributes: {
      fitment:
        'Fits 2011–2016 GM 6.6L Duramax LML. Bolt-on OE replacement variable-geometry turbo; reuses the factory VGT harness and downpipe.',
      specs: [
        { label: 'Compressor wheel', value: '61 mm' },
        { label: 'Turbine', value: 'Variable-geometry (VGT)' },
        { label: 'Bearing', value: 'Journal' },
        { label: 'Actuator', value: 'Electronic, pre-calibrated' },
      ],
      warranty:
        '12-month / unlimited-mile limited warranty against defects; balanced and flow-tested before shipping.',
    },
    vendor: 'Garrett',
    variants: [
      {
        sku: 'TURBO-LML',
        title: null,
        priceCents: 129900,
        costCents: 82000,
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 3,
            reorderQuantity: 6,
            leadTimeDays: 35,
            movements: [recv(8, 50), sale(2, 14)],
          },
          { warehouse: 'WEST-3PL', movements: [recv(3, 22)] },
        ],
      },
    ],
  },
  {
    handle: 'inv-demo-oil-15w40',
    title: 'Diesel Engine Oil 15W-40 (1 gal)',
    productType: 'Fluids',
    attributes: {
      fitment:
        'For any heavy-duty diesel calling for a 15W-40 CK-4 engine oil — on-highway trucks, fleet pickups, and equipment. One US gallon.',
      specs: [
        { label: 'Viscosity', value: '15W-40' },
        { label: 'Spec', value: 'API CK-4 / CJ-4' },
        { label: 'Base', value: 'Synthetic blend' },
        { label: 'Volume', value: '1 US gal (3.78 L)' },
      ],
      warranty:
        'Meets or exceeds OEM warranty requirements when used at the manufacturer’s specified drain interval.',
    },
    vendor: 'Shell Rotella',
    hazmatClass: 'class9',
    variants: [
      {
        sku: 'OIL-15W40-1G',
        title: null,
        priceCents: 2999,
        costCents: 1450,
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 60,
            reorderQuantity: 240,
            leadTimeDays: 5,
            movements: [recv(480, 28), sale(96, 10), sale(72, 3)],
          },
          {
            warehouse: 'WEST-3PL',
            reorderPoint: 40,
            reorderQuantity: 160,
            movements: [recv(240, 26), sale(48, 7)],
          },
        ],
      },
    ],
  },
  {
    handle: 'inv-demo-coolant-hd',
    title: 'Heavy-Duty Coolant — Nitrite-Free (1 gal)',
    productType: 'Fluids',
    attributes: {
      fitment:
        'For heavy-duty diesel cooling systems that require a nitrite-free extended-life coolant (ELC). Pre-diluted 50/50 — ready to fill. One US gallon.',
      specs: [
        { label: 'Type', value: 'ELC, nitrite-free (NOAT)' },
        { label: 'Concentration', value: '50/50 pre-mix' },
        { label: 'Service life', value: 'Up to 600,000 mi with extender' },
        { label: 'Volume', value: '1 US gal (3.78 L)' },
      ],
      warranty:
        'Backed against coolant-related cooling-system failure when maintained per the service schedule.',
    },
    vendor: 'Fleetguard',
    hazmatClass: 'class9',
    variants: [
      {
        sku: 'COOL-HD-1G',
        title: null,
        priceCents: 1999,
        costCents: 950,
        // Low: 18 on hand, reorder point 30.
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 30,
            reorderQuantity: 120,
            leadTimeDays: 6,
            movements: [recv(120, 20), sale(60, 9), sale(42, 2)],
          },
        ],
      },
    ],
  },
  {
    handle: 'inv-demo-serpentine-belt-73',
    title: 'Serpentine Belt — 7.3L Power Stroke',
    productType: 'Belts',
    attributes: {
      fitment:
        'Fits 1994–2003 Ford 7.3L Power Stroke diesel with A/C. Routes to the factory tensioner; verify routing against the underhood diagram before install.',
      specs: [
        { label: 'Ribs', value: '6-rib (K6)' },
        { label: 'Effective length', value: '2,225 mm' },
        { label: 'Material', value: 'EPDM' },
        { label: 'Temp range', value: '−40 to 130 °C' },
      ],
      warranty:
        '36-month / 100,000-mile limited warranty against cracking, glazing, and rib separation.',
    },
    vendor: 'Gates',
    variants: [
      {
        sku: 'BELT-73',
        title: null,
        priceCents: 4599,
        costCents: 2200,
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 20,
            reorderQuantity: 80,
            leadTimeDays: 9,
            movements: [recv(64, 33), sale(19, 11), sale(8, 4)],
          },
        ],
      },
    ],
  },
  {
    handle: 'inv-demo-water-pump-66',
    title: 'Water Pump — 6.6L Duramax',
    productType: 'Cooling',
    attributes: {
      fitment:
        'Fits 2001–2016 GM 6.6L Duramax diesel. Mechanical OE-replacement water pump; comes with a new gasket. Refill with nitrite-free ELC on install.',
      specs: [
        { label: 'Drive', value: 'Belt-driven' },
        { label: 'Impeller', value: 'Cast iron, 8-vane' },
        { label: 'Gasket', value: 'Included' },
        { label: 'Bearing', value: 'Sealed, pre-lubricated' },
      ],
      warranty: '24-month / unlimited-mile limited warranty against leaks and bearing failure.',
    },
    vendor: 'ACDelco',
    variants: [
      {
        sku: 'WP-66',
        title: null,
        priceCents: 17999,
        costCents: 9500,
        levels: [
          {
            warehouse: 'MAIN',
            reorderPoint: 6,
            reorderQuantity: 18,
            leadTimeDays: 16,
            movements: [recv(22, 44), sale(7, 13), sale(3, 5)],
          },
        ],
      },
    ],
  },
];

const DEMO_LOTS: DemoLot[] = [
  {
    sku: 'OIL-15W40-1G',
    warehouse: 'MAIN',
    lotNumber: 'ROT-2026-0418',
    quantity: 480,
    expiresInDays: 540,
    hazmatClass: 'class9',
  },
  {
    sku: 'OIL-15W40-1G',
    warehouse: 'WEST-3PL',
    lotNumber: 'ROT-2026-0392',
    quantity: 240,
    expiresInDays: 300,
    hazmatClass: 'class9',
  },
  // An expiring-soon lot (inside the 1-year window the Lots page surfaces).
  {
    sku: 'COOL-HD-1G',
    warehouse: 'MAIN',
    lotNumber: 'FG-COOL-2025-7731',
    quantity: 120,
    expiresInDays: 120,
    hazmatClass: 'class9',
  },
  // An active recall — drives the Lots page's recall watch list.
  {
    sku: 'GP-60-SET8',
    warehouse: 'MAIN',
    lotNumber: 'MC-GP60-2025-1188',
    quantity: 28,
    expiresInDays: null,
    recall: 'Supplier notice: ceramic tip may crack on cold-start cycling.',
  },
];

function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function seedDemoInventory(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    // Warehouses — upsert by (tenant, code); persist across re-runs.
    const whByCode = new Map<DemoWh, string>();
    for (const w of DEMO_WAREHOUSES) {
      const row = await tx.warehouse.upsert({
        where: { tenantId_code: { tenantId, code: w.code } },
        update: { name: w.name, type: w.type, city: w.city, region: w.region, country: 'US' },
        create: {
          tenantId,
          code: w.code,
          name: w.name,
          type: w.type,
          city: w.city,
          region: w.region,
          country: 'US',
        },
      });
      whByCode.set(w.code as DemoWh, row.id);
    }
    const mainId = whByCode.get('MAIN')!;

    // Stale storefront/test carts pin demo variants via a RESTRICT FK
    // (commerce_cart_items.variant_id), which would block the product reset
    // below. Carts are ephemeral shopping sessions — clear this tenant's first so
    // the idempotent re-seed always succeeds.
    await tx.cartItem.deleteMany({ where: { tenantId } });
    await tx.cart.deleteMany({ where: { tenantId } });

    // Drop prior demo products → cascades variants/levels/movements/lots.
    await tx.product.deleteMany({ where: { tenantId, handle: { startsWith: 'inv-demo-' } } });

    const variantIdBySku = new Map<string, string>();
    // sku → { id, costCents } — the purchasing seed (suppliers / POs) needs the
    // cost to derive a believable purchase price below retail cost.
    const variantMetaBySku = new Map<string, { id: string; costCents: number }>();

    for (const p of DEMO_PRODUCTS) {
      const prices = p.variants.map((v) => v.priceCents);
      const anyStock = p.variants.some((v) =>
        v.levels.some((l) => l.movements.reduce((s, m) => s + m.delta, 0) > 0)
      );
      const product = await tx.product.create({
        data: {
          tenantId,
          title: p.title,
          handle: p.handle,
          status: 'active',
          productType: p.productType,
          // The typed product-type link + validated attribute bag (docs/143). Built-in
          // `auto_part` is seeded under the platform tenant by migration 20270206000000,
          // so it resolves for the demo tenant via RLS.
          productTypeKey: 'auto_part',
          attributes: p.attributes ?? {},
          vendor: p.vendor,
          hazmatClass: p.hazmatClass ?? 'none',
          defaultWarehouseId: mainId,
          priceMinCents: Math.min(...prices),
          priceMaxCents: Math.max(...prices),
          inStock: anyStock,
          publishedAt: new Date(),
          metadata: { demo: 'inventory' },
        },
      });

      // A primary product image so the storefront renders a real tile instead of
      // the broken-image placeholder. A self-contained `data:image/svg+xml` asset —
      // no GCS, no network, identical dev/prod — served inline by the public media
      // route's `data:` branch. Find-or-create by `key` (the SVG embeds the title,
      // stable per product) so a re-seed reuses the asset rather than accumulating
      // one each run (product delete cascades the VariantImage but NOT the asset).
      const label = p.title.replace(/[<&>]/g, ' ');
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">` +
        `<rect width="600" height="600" fill="#1f2937"/>` +
        `<text x="300" y="300" font-family="sans-serif" font-size="26" fill="#e5e7eb" ` +
        `text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
      const key = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      const existingAsset = await tx.mediaAsset.findFirst({
        where: { tenantId, key },
        select: { id: true },
      });
      const mediaAssetId =
        existingAsset?.id ??
        (
          await tx.mediaAsset.create({
            data: {
              tenantId,
              key,
              originalFilename: `${p.handle}.svg`,
              mimeType: 'image/svg+xml',
              byteSize: BigInt(0),
              status: 'ready',
              width: 600,
              height: 600,
              altText: p.title,
            },
            select: { id: true },
          })
        ).id;
      await tx.variantImage.create({
        data: {
          tenantId,
          productId: product.id,
          variantId: null,
          mediaAssetId,
          position: 0,
          isPrimary: true,
          alt: p.title,
        },
      });

      for (const [i, v] of p.variants.entries()) {
        const variant = await tx.productVariant.create({
          data: {
            tenantId,
            productId: product.id,
            sku: v.sku,
            title: v.title,
            priceCents: v.priceCents,
            costCents: v.costCents,
            currency: 'USD',
            isDefault: i === 0,
          },
        });
        variantIdBySku.set(v.sku, variant.id);
        variantMetaBySku.set(v.sku, { id: variant.id, costCents: v.costCents });

        for (const lvl of v.levels) {
          const warehouseId = whByCode.get(lvl.warehouse)!;
          const onHand = lvl.movements.reduce((s, m) => s + m.delta, 0);
          await tx.inventoryLevel.create({
            data: {
              tenantId,
              variantId: variant.id,
              warehouseId,
              onHand,
              ...(lvl.reorderPoint !== undefined ? { reorderPoint: lvl.reorderPoint } : {}),
              ...(lvl.reorderQuantity !== undefined
                ? { reorderQuantity: lvl.reorderQuantity }
                : {}),
              ...(lvl.leadTimeDays !== undefined ? { leadTimeDays: lvl.leadTimeDays } : {}),
              unitCostCents: v.costCents,
              avgCostCents: v.costCents,
            },
          });

          // Replay the movements oldest→newest so balance_after is the running
          // on-hand and Σ(delta) lands exactly on the level's on_hand.
          let balance = 0;
          const chrono = [...lvl.movements].sort((a, b) => b.daysAgo - a.daysAgo);
          for (const m of chrono) {
            balance += m.delta;
            await tx.inventoryMovement.create({
              data: {
                tenantId,
                variantId: variant.id,
                warehouseId,
                delta: m.delta,
                balanceAfter: balance,
                reason: m.reason,
                actorType: 'system',
                source: 'seed',
                ...(m.reason === 'receive' ? { unitCostCents: v.costCents } : {}),
                createdAt: daysAgoDate(m.daysAgo),
              },
            });
          }
        }
      }
    }

    // Lot batches (fluids + a recalled glow-plug set).
    for (const lot of DEMO_LOTS) {
      const variantId = variantIdBySku.get(lot.sku);
      if (!variantId) continue;
      const warehouseId = whByCode.get(lot.warehouse)!;
      await tx.lotBatch.create({
        data: {
          tenantId,
          variantId,
          warehouseId,
          lotNumber: lot.lotNumber,
          quantity: lot.quantity,
          hazmatClass: lot.hazmatClass ?? 'none',
          ...(lot.expiresInDays !== null ? { expiresAt: daysAgoDate(-lot.expiresInDays) } : {}),
          manufacturedAt: daysAgoDate(90),
          ...(lot.recall
            ? { recallStatus: 'active', recallReason: lot.recall, recalledAt: daysAgoDate(4) }
            : {}),
        },
      });
    }

    // ── Supply path (P3b): suppliers, purchasing links, demo POs ──────────────
    // Two vendors, each sourcing a few variants below the retail cost, plus a
    // draft + a submitted PO so /inventory/suppliers + /purchase-orders render
    // real data on a fresh tenant. Idempotent: suppliers upsert by code, their
    // prior POs are cleared and recreated.
    const DEMO_SUPPLIERS = [
      {
        code: 'SUP-BOSCH',
        name: 'Bosch Diesel Supply',
        terms: 'net30',
        lead: 7,
        city: 'Charleston',
        region: 'SC',
      },
      {
        code: 'SUP-STAN',
        name: 'Stanadyne Distribution',
        terms: 'net45',
        lead: 14,
        city: 'Windsor',
        region: 'CT',
      },
    ];
    const supplierByCode = new Map<string, string>();
    for (const s of DEMO_SUPPLIERS) {
      const row = await tx.supplier.upsert({
        where: { tenantId_code: { tenantId, code: s.code } },
        update: {
          name: s.name,
          paymentTerms: s.terms,
          leadTimeDays: s.lead,
          city: s.city,
          region: s.region,
          country: 'US',
          isActive: true,
          deletedAt: null,
        },
        create: {
          tenantId,
          code: s.code,
          name: s.name,
          paymentTerms: s.terms,
          leadTimeDays: s.lead,
          city: s.city,
          region: s.region,
          country: 'US',
        },
      });
      supplierByCode.set(s.code, row.id);
    }

    // Purchasing links — first 6 variants split across the two suppliers, priced
    // at 96% of the variant cost and flagged preferred.
    const linkSkus = [...variantMetaBySku.entries()].slice(0, 6);
    const buyCost = (costCents: number): number => Math.round(costCents * 0.96);
    for (const [i, [sku, meta]] of linkSkus.entries()) {
      const supplierId = supplierByCode.get(i % 2 === 0 ? 'SUP-BOSCH' : 'SUP-STAN')!;
      await tx.supplierVariant.upsert({
        where: { supplierId_variantId: { supplierId, variantId: meta.id } },
        update: {
          unitCostCents: buyCost(meta.costCents),
          supplierSku: `${sku}-V`,
          isPreferred: true,
        },
        create: {
          tenantId,
          supplierId,
          variantId: meta.id,
          unitCostCents: buyCost(meta.costCents),
          supplierSku: `${sku}-V`,
          minOrderQty: 5,
          isPreferred: true,
        },
      });
    }

    // Clear prior demo POs (their lines already cascaded with the product reset),
    // then create a draft + a submitted order numbered after any existing POs.
    await tx.purchaseOrder.deleteMany({
      where: { supplierId: { in: [...supplierByCode.values()] } },
    });
    const poBase = await tx.purchaseOrder.count({ where: { tenantId } });
    const grBase = await tx.goodsReceipt.count({ where: { tenantId } });
    let receiptSeq = 0;
    const poDefs = [
      { code: 'SUP-BOSCH', status: 'draft', skus: linkSkus.slice(0, 2), shipping: 0 },
      { code: 'SUP-STAN', status: 'submitted', skus: linkSkus.slice(2, 4), shipping: 2500 },
    ];
    for (const [i, def] of poDefs.entries()) {
      const lines = def.skus.map(([sku, meta]) => ({
        sku,
        meta,
        qty: 20,
        unitCostCents: buyCost(meta.costCents),
      }));
      const subtotal = lines.reduce((s, l) => s + l.qty * l.unitCostCents, 0);
      const submitted = def.status === 'submitted';
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId,
          number: `PO-${String(poBase + i + 1).padStart(6, '0')}`,
          supplierId: supplierByCode.get(def.code)!,
          warehouseId: mainId,
          status: def.status,
          currency: 'USD',
          reference: 'Replenishment',
          shippingCents: def.shipping,
          subtotalCents: subtotal,
          totalCents: subtotal + def.shipping,
          ...(submitted ? { orderedAt: daysAgoDate(3), expectedArrivalAt: daysAgoDate(-11) } : {}),
        },
      });
      const poLineRows: { id: string; variantId: string; unitCostCents: number; qty: number }[] =
        [];
      for (const l of lines) {
        const row = await tx.purchaseOrderLine.create({
          data: {
            tenantId,
            purchaseOrderId: po.id,
            variantId: l.meta.id,
            quantityOrdered: l.qty,
            unitCostCents: l.unitCostCents,
            supplierSku: `${l.sku}-V`,
            description: l.sku,
          },
        });
        poLineRows.push({
          id: row.id,
          variantId: l.meta.id,
          unitCostCents: l.unitCostCents,
          qty: l.qty,
        });
      }

      // The submitted PO gets a partial goods receipt (half of its first line) so
      // /inventory/receiving shows real history + received progress, and the PO
      // becomes `partial`. The receive movement raises the level on-hand + moving
      // average, keeping Σ(delta) == on_hand.
      if (submitted && poLineRows[0]) {
        receiptSeq += 1;
        const first = poLineRows[0];
        const recvQty = Math.floor(first.qty / 2);
        const gr = await tx.goodsReceipt.create({
          data: {
            tenantId,
            number: `GR-${String(grBase + receiptSeq).padStart(6, '0')}`,
            purchaseOrderId: po.id,
            warehouseId: mainId,
            reference: 'PACKING-7741',
            receivedAt: daysAgoDate(1),
          },
        });
        const level = await tx.inventoryLevel.findUnique({
          where: { variantId_warehouseId: { variantId: first.variantId, warehouseId: mainId } },
        });
        const prevOnHand = level?.onHand ?? 0;
        const newOnHand = prevOnHand + recvQty;
        const oldAvg = level?.avgCostCents ?? first.unitCostCents;
        const newAvg = Math.round(
          (prevOnHand * oldAvg + recvQty * first.unitCostCents) / newOnHand
        );
        const mv = await tx.inventoryMovement.create({
          data: {
            tenantId,
            variantId: first.variantId,
            warehouseId: mainId,
            delta: recvQty,
            balanceAfter: newOnHand,
            reason: 'receive',
            actorType: 'system',
            source: 'seed',
            unitCostCents: first.unitCostCents,
            referenceType: 'GoodsReceipt',
            referenceId: gr.id,
            createdAt: daysAgoDate(1),
          },
        });
        await tx.inventoryLevel.upsert({
          where: { variantId_warehouseId: { variantId: first.variantId, warehouseId: mainId } },
          update: { onHand: newOnHand, avgCostCents: newAvg },
          create: {
            tenantId,
            variantId: first.variantId,
            warehouseId: mainId,
            onHand: newOnHand,
            avgCostCents: newAvg,
            unitCostCents: first.unitCostCents,
          },
        });
        await tx.goodsReceiptLine.create({
          data: {
            tenantId,
            goodsReceiptId: gr.id,
            purchaseOrderLineId: first.id,
            variantId: first.variantId,
            quantityReceived: recvQty,
            unitCostCents: first.unitCostCents,
            movementId: mv.id,
          },
        });
        await tx.purchaseOrderLine.update({
          where: { id: first.id },
          data: { quantityReceived: recvQty },
        });
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'partial' } });
      }
    }

    // ── Transfers (P4): a draft MAIN → WEST-3PL the user can ship + receive ───
    // A draft moves no stock, so it can't break the Σ(movements) == on_hand
    // invariant; shipping/receiving it in the UI is the deploy-gate exercise.
    // Lines reference two fast movers that have MAIN stock so the draft ships.
    await tx.inventoryTransfer.deleteMany({ where: { tenantId } });
    const westId = whByCode.get('WEST-3PL')!;
    const shippable = await tx.inventoryLevel.findMany({
      where: { warehouseId: mainId, onHand: { gte: 5 } },
      select: { variantId: true },
      orderBy: { onHand: 'desc' },
      take: 2,
    });
    let transferCount = 0;
    if (shippable.length > 0 && westId !== mainId) {
      const transfer = await tx.inventoryTransfer.create({
        data: {
          tenantId,
          number: 'TRF-000001',
          fromWarehouseId: mainId,
          toWarehouseId: westId,
          status: 'draft',
          note: 'Rebalance fast movers to the West Coast 3PL',
        },
      });
      for (const lvl of shippable) {
        await tx.inventoryTransferLine.create({
          data: { tenantId, transferId: transfer.id, variantId: lvl.variantId, quantity: 5 },
        });
      }
      transferCount = 1;
    }

    // ── External sync (P5 Tier C): a CSV connection with mappings + a queue ────
    // A demo source so the sync-health panel, SKU mappings, and the unmapped-SKU
    // review queue render real data. The illustrative run shows the feed agreeing
    // on the two mapped items, with three external SKUs still awaiting mapping.
    await tx.inventorySource.deleteMany({ where: { tenantId, name: 'Warehouse CSV feed' } });
    const mappedSkus = [...variantIdBySku.entries()].slice(0, 2);
    let sourceCount = 0;
    if (mappedSkus.length > 0) {
      const source = await tx.inventorySource.create({
        data: {
          tenantId,
          name: 'Warehouse CSV feed',
          type: 'csv',
          config: { csvUrl: 'https://wms.example.com/exports/on-hand.csv' },
          status: 'active',
          syncIntervalSec: 3600,
          lastSyncAt: new Date(),
          notes: 'Nightly on-hand export from the WMS (demo).',
        },
      });
      for (const [i, [sku, vid]] of mappedSkus.entries()) {
        // The first mapping demos the P5b sync controls: the feed reports this item
        // by the case (×6), and a 3-unit safety buffer is withheld from sale.
        await tx.inventorySourceLink.create({
          data: {
            tenantId,
            sourceId: source.id,
            variantId: vid,
            warehouseId: mainId,
            externalSku: `WMS-${sku}`,
            ...(i === 0 ? { externalUom: 'case', unitsPerExternal: 6 } : {}),
          },
        });
        if (i === 0) {
          await tx.inventoryLevel.updateMany({
            where: { tenantId, variantId: vid, warehouseId: mainId },
            data: { safetyBuffer: 3 },
          });
        }
      }
      for (const ext of ['WMS-FLT-9001', 'WMS-BRK-2204', 'WMS-SEAL-118']) {
        await tx.inventoryUnmappedSku.create({
          data: { tenantId, sourceId: source.id, externalSku: ext, lastQuantity: 12, seenCount: 2 },
        });
      }
      await tx.inventorySyncRun.create({
        data: {
          tenantId,
          sourceId: source.id,
          trigger: 'manual',
          status: 'partial',
          rowsTotal: mappedSkus.length + 3,
          rowsMatched: mappedSkus.length,
          rowsChanged: 0,
          rowsUnchanged: mappedSkus.length,
          rowsUnmatched: 3,
          rowsSkipped: 0,
          finishedAt: new Date(),
        },
      });
      sourceCount = 1;
    }

    // A second connection demonstrating Tier B (SaaS HTTP-API pull, docs/100 P5c):
    // a declarative endpoint + bearer auth + JSON field mapping. Manual-only
    // (syncIntervalSec 0) so the demo never reaches the placeholder endpoint; it
    // renders a real API connection in the sources list + detail, and the stored
    // secret is redacted by the API on read.
    await tx.inventorySource.deleteMany({ where: { tenantId, name: 'ERP API (NetSuite)' } });
    await tx.inventorySource.create({
      data: {
        tenantId,
        name: 'ERP API (NetSuite)',
        type: 'api',
        config: {
          endpoint: 'https://erp.example.com/api/v1/inventory',
          authScheme: 'bearer',
          apiKey: 'demo-token-do-not-use',
          itemsPath: 'data.items',
          skuField: 'sku',
          quantityField: 'quantityAvailable',
          locationField: 'location',
          costField: 'unitCost',
          costUnit: 'dollars',
          syncedAtField: 'lastModified',
          pageParam: 'page',
          maxPages: 10,
        },
        status: 'active',
        syncIntervalSec: 0,
        notes: 'Generic HTTP-API pull (Tier B) — demo config; manual sync only.',
      },
    });
    sourceCount += 1;

    // A third connection demonstrating Tier A (on-prem bridge agent, docs/100 P5d):
    // a LAN-only ERP (Fishbowl archetype) fed by the sparx Inventory Bridge over
    // outbound HTTPS. Seeded paired + online (a real api_keys row + a fresh
    // agentLastSeenAt) so the agent panel renders an "Online" agent.
    await tx.inventorySource.deleteMany({
      where: { tenantId, name: 'Fishbowl bridge (warehouse)' },
    });
    await tx.apiKey.deleteMany({
      where: { tenantId, name: 'Bridge: Fishbowl bridge (warehouse)' },
    });
    const bridgeKey = await tx.apiKey.create({
      data: {
        tenantId,
        name: 'Bridge: Fishbowl bridge (warehouse)',
        keyPrefix: 'sk_live_demo0001',
        keyHash: 'demo-seed-not-a-real-hash',
        scopes: ['inventory:push'],
      },
    });
    await tx.inventorySource.create({
      data: {
        tenantId,
        name: 'Fishbowl bridge (warehouse)',
        type: 'agent',
        config: {},
        status: 'active',
        syncIntervalSec: 300,
        apiKeyId: bridgeKey.id,
        apiKeyPrefix: bridgeKey.keyPrefix,
        enrolledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        agentLastSeenAt: new Date(),
        agentVersion: '0.1.0',
        lastSyncAt: new Date(),
        notes: 'On-prem bridge for the LAN-only ERP (Tier A demo).',
      },
    });
    sourceCount += 1;

    const variantCount = variantIdBySku.size;
    console.log(
      `Seeded demo inventory: ${DEMO_PRODUCTS.length} products / ${variantCount} variants across ` +
        `${DEMO_WAREHOUSES.length} warehouses, with ledger movements + ${DEMO_LOTS.length} lots, ` +
        `${DEMO_SUPPLIERS.length} suppliers + ${poDefs.length} purchase orders + ${receiptSeq} receipt` +
        ` + ${transferCount} transfer + ${sourceCount} sync source.`
    );
  });
}

// ── Demo scheduling data (docs/79) ───────────────────────────────────────────
// Rich, industry-varied booking data for the e2e tenant so the Scheduling
// dashboard, the public /book page, and the availability engine all show real
// data locally. Idempotent: every demo row is tagged `settings.demo:'scheduling'`
// (or, for bookings, hangs off a demo service) and cleared up-front on re-run.

interface DemoResource {
  key: string;
  kind: 'staff' | 'space' | 'table' | 'equipment';
  name: string;
  color?: string;
  skillTags?: string[];
  capacityMin?: number;
  capacityMax?: number;
  // Weekly hours: days (0=Sun..6=Sat) + [startMinute, endMinute] in the resource zone.
  hours: { days: number[]; start: number; end: number };
}

interface DemoService {
  key: string;
  name: string;
  bookingType: 'appointment' | 'class' | 'reservation' | 'rental';
  durationMinutes: number;
  priceCents: number;
  capacity?: number;
  bufferAfterMin?: number;
  requiresApproval?: boolean;
  slotIntervalMin?: number;
  // How the booking picks its resources (docs/79 §7.5). Omitted = 'any_available'.
  // 'customer_choice' surfaces the "choose your {provider}" step in the storefront
  // widget; 'round_robin' balances load across the eligible pool.
  assignmentStrategy?: 'any_available' | 'round_robin' | 'collective' | 'customer_choice';
  description: string;
  requirements: { role: string; kind: DemoResource['kind']; skillTags?: string[] }[];
}

interface DemoBooking {
  service: string;
  resources: string[]; // resource keys to allocate
  customerEmail: string;
  dayOffset: number;
  hour: number;
  minute?: number;
  status: 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  partySize?: number;
  extraAttendees?: number; // for classes
}

const WEEKDAYS = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];

const DEMO_RESOURCES: DemoResource[] = [
  {
    key: 'alex',
    kind: 'staff',
    name: 'Alex Rivera',
    color: '#6366F1',
    skillTags: ['haircut', 'color'],
    hours: { days: MON_SAT, start: 9 * 60, end: 17 * 60 },
  },
  {
    key: 'jordan',
    kind: 'staff',
    name: 'Jordan Lee',
    color: '#0EA5E9',
    skillTags: ['haircut', 'beard'],
    hours: { days: WEEKDAYS, start: 10 * 60, end: 18 * 60 },
  },
  {
    key: 'maya',
    kind: 'staff',
    name: 'Maya Patel',
    color: '#14B8A6',
    skillTags: ['massage', 'facial'],
    hours: { days: MON_SAT, start: 9 * 60, end: 16 * 60 },
  },
  {
    key: 'chris',
    kind: 'staff',
    name: 'Chris Doyle',
    color: '#F97316',
    skillTags: ['yoga', 'pilates'],
    hours: { days: MON_SAT, start: 7 * 60, end: 12 * 60 },
  },
  {
    key: 'studioA',
    kind: 'space',
    name: 'Studio A',
    color: '#8B5CF6',
    hours: { days: MON_SAT, start: 6 * 60, end: 21 * 60 },
  },
  {
    key: 'room1',
    kind: 'space',
    name: 'Treatment Room 1',
    color: '#06B6D4',
    hours: { days: MON_SAT, start: 9 * 60, end: 17 * 60 },
  },
  {
    key: 'table4',
    kind: 'table',
    name: 'Table 4',
    capacityMin: 1,
    capacityMax: 4,
    hours: { days: MON_SAT, start: 17 * 60, end: 22 * 60 },
  },
  {
    key: 'table8',
    kind: 'table',
    name: 'Table 8',
    capacityMin: 4,
    capacityMax: 8,
    hours: { days: MON_SAT, start: 17 * 60, end: 22 * 60 },
  },
  {
    key: 'kayak1',
    kind: 'equipment',
    name: 'Kayak #1',
    hours: { days: MON_SAT, start: 9 * 60, end: 17 * 60 },
  },
  {
    key: 'kayak2',
    kind: 'equipment',
    name: 'Kayak #2',
    hours: { days: MON_SAT, start: 9 * 60, end: 17 * 60 },
  },
];

const DEMO_SERVICES: DemoService[] = [
  {
    key: 'haircut',
    name: 'Haircut & Style',
    bookingType: 'appointment',
    durationMinutes: 45,
    priceCents: 4500,
    // Guests pick their stylist — two staff carry the `haircut` skill (Alex, Jordan),
    // so the storefront widget shows a real "choose your stylist" step.
    assignmentStrategy: 'customer_choice',
    description: 'A cut and finish with one of our stylists.',
    requirements: [{ role: 'stylist', kind: 'staff', skillTags: ['haircut'] }],
  },
  {
    key: 'massage',
    name: 'Deep Tissue Massage (60 min)',
    bookingType: 'appointment',
    durationMinutes: 60,
    priceCents: 9500,
    bufferAfterMin: 15,
    // A massage is booked with your therapist by name.
    assignmentStrategy: 'customer_choice',
    description: 'A 60-minute therapeutic massage.',
    requirements: [{ role: 'therapist', kind: 'staff', skillTags: ['massage'] }],
  },
  {
    key: 'consult',
    name: 'New Client Consultation',
    bookingType: 'appointment',
    durationMinutes: 30,
    priceCents: 0,
    requiresApproval: true,
    // Any staff member can take an intro — round-robin balances them across the team.
    assignmentStrategy: 'round_robin',
    description: 'A free 30-minute intro consultation (request — we confirm).',
    requirements: [{ role: 'staff', kind: 'staff' }],
  },
  {
    key: 'yoga',
    name: 'Morning Yoga Flow',
    bookingType: 'class',
    durationMinutes: 60,
    priceCents: 2200,
    capacity: 12,
    description: 'A 60-minute all-levels vinyasa class.',
    requirements: [
      { role: 'instructor', kind: 'staff', skillTags: ['yoga'] },
      { role: 'room', kind: 'space' },
    ],
  },
  {
    key: 'dinner',
    name: 'Dinner Reservation',
    bookingType: 'reservation',
    durationMinutes: 120,
    priceCents: 0,
    slotIntervalMin: 30,
    description: 'Reserve a table for dinner service.',
    requirements: [{ role: 'table', kind: 'table' }],
  },
  {
    key: 'kayak',
    name: 'Kayak Rental (2 hr)',
    bookingType: 'rental',
    durationMinutes: 120,
    priceCents: 4000,
    bufferAfterMin: 30,
    description: 'A two-hour single-kayak rental, paddle included.',
    requirements: [{ role: 'kayak', kind: 'equipment' }],
  },
];

const DEMO_CUSTOMERS = [
  { email: 'dana.wells@example.com', firstName: 'Dana', lastName: 'Wells', phone: '+15555550110' },
  { email: 'pat.kim@example.com', firstName: 'Pat', lastName: 'Kim', phone: '+15555550111' },
  { email: 'lee.ray@example.com', firstName: 'Lee', lastName: 'Ray', phone: '+15555550112' },
  { email: 'sam.ford@example.com', firstName: 'Sam', lastName: 'Ford', phone: '+15555550113' },
  { email: 'robin.cho@example.com', firstName: 'Robin', lastName: 'Cho', phone: '+15555550114' },
];

const DEMO_BOOKINGS: DemoBooking[] = [
  {
    service: 'haircut',
    resources: ['alex'],
    customerEmail: 'dana.wells@example.com',
    dayOffset: 1,
    hour: 10,
    status: 'confirmed',
  },
  {
    service: 'haircut',
    resources: ['jordan'],
    customerEmail: 'sam.ford@example.com',
    dayOffset: 1,
    hour: 11,
    status: 'confirmed',
  },
  {
    service: 'massage',
    resources: ['maya'],
    customerEmail: 'pat.kim@example.com',
    dayOffset: 2,
    hour: 14,
    status: 'confirmed',
  },
  {
    service: 'consult',
    resources: ['alex'],
    customerEmail: 'lee.ray@example.com',
    dayOffset: 3,
    hour: 13,
    status: 'requested',
  },
  {
    service: 'yoga',
    resources: ['chris', 'studioA'],
    customerEmail: 'robin.cho@example.com',
    dayOffset: 1,
    hour: 8,
    status: 'confirmed',
    extraAttendees: 6,
  },
  {
    service: 'dinner',
    resources: ['table4'],
    customerEmail: 'sam.ford@example.com',
    dayOffset: 0,
    hour: 19,
    status: 'confirmed',
    partySize: 3,
  },
  {
    service: 'kayak',
    resources: ['kayak1'],
    customerEmail: 'robin.cho@example.com',
    dayOffset: 4,
    hour: 10,
    status: 'confirmed',
  },
  {
    service: 'haircut',
    resources: ['alex'],
    customerEmail: 'pat.kim@example.com',
    dayOffset: -3,
    hour: 15,
    status: 'completed',
  },
  {
    service: 'massage',
    resources: ['maya'],
    customerEmail: 'dana.wells@example.com',
    dayOffset: -2,
    hour: 11,
    status: 'cancelled',
  },
];

function attendeeStatusFor(bookingStatus: DemoBooking['status']): string {
  switch (bookingStatus) {
    case 'completed':
      return 'attended';
    case 'in_progress':
      return 'checked_in';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'booked';
  }
}

function atUtc(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

async function seedDemoScheduling(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    const demoMarker = { path: ['demo'], equals: 'scheduling' };

    // Clear prior demo rows (bookings first — they reference resources/services).
    const priorServices = await tx.schedulingService.findMany({
      where: { settings: demoMarker },
      select: { id: true },
    });
    if (priorServices.length > 0) {
      await tx.booking.deleteMany({ where: { serviceId: { in: priorServices.map((s) => s.id) } } });
    }
    await tx.schedulingService.deleteMany({ where: { settings: demoMarker } });
    await tx.schedulingResource.deleteMany({ where: { settings: demoMarker } });

    // Resources + their weekly availability windows.
    const resourceIdByKey = new Map<string, string>();
    for (const r of DEMO_RESOURCES) {
      const res = await tx.schedulingResource.create({
        data: {
          tenantId,
          kind: r.kind,
          name: r.name,
          color: r.color ?? null,
          timezone: 'UTC',
          skillTags: r.skillTags ?? [],
          capacityMin: r.capacityMin ?? null,
          capacityMax: r.capacityMax ?? null,
          settings: { demo: 'scheduling' },
        },
      });
      resourceIdByKey.set(r.key, res.id);
      await tx.availabilityWindow.createMany({
        data: r.hours.days.map((dayOfWeek) => ({
          tenantId,
          resourceId: res.id,
          dayOfWeek,
          startMinute: r.hours.start,
          endMinute: r.hours.end,
        })),
      });
    }

    // Services (with their resource-role requirements).
    const serviceByKey = new Map<
      string,
      {
        id: string;
        durationMinutes: number;
        bufferAfterMin: number;
        bookingType: string;
        capacity: number;
      }
    >();
    for (const s of DEMO_SERVICES) {
      const svc = await tx.schedulingService.create({
        data: {
          tenantId,
          bookingType: s.bookingType,
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          bufferAfterMin: s.bufferAfterMin ?? 0,
          priceCents: s.priceCents,
          capacity: s.capacity ?? 1,
          slotIntervalMin: s.slotIntervalMin ?? 15,
          requiresApproval: s.requiresApproval ?? false,
          assignmentStrategy: s.assignmentStrategy ?? 'any_available',
          resourceRequirements: s.requirements,
          settings: { demo: 'scheduling' },
        },
      });
      serviceByKey.set(s.key, {
        id: svc.id,
        durationMinutes: s.durationMinutes,
        bufferAfterMin: s.bufferAfterMin ?? 0,
        bookingType: s.bookingType,
        capacity: s.capacity ?? 1,
      });
    }

    // Demo customers (find-or-create by email — the shared customer spine).
    const customerIdByEmail = new Map<string, string>();
    for (const c of DEMO_CUSTOMERS) {
      const existing = await tx.customer.findFirst({
        where: { email: c.email },
        select: { id: true },
      });
      const id =
        existing?.id ??
        (
          await tx.customer.create({
            data: {
              tenantId,
              email: c.email,
              firstName: c.firstName,
              lastName: c.lastName,
              phone: c.phone,
              metadata: { source: 'scheduling-demo' },
            },
            select: { id: true },
          })
        ).id;
      customerIdByEmail.set(c.email, id);
    }

    // Bookings — direct inserts with their resource allocations + attendees. Times
    // are spaced so no exclusive resource overlaps (the no-overlap EXCLUDE holds).
    for (const b of DEMO_BOOKINGS) {
      const svc = serviceByKey.get(b.service);
      const customerId = customerIdByEmail.get(b.customerEmail);
      if (!svc || !customerId) continue;
      const startAt = atUtc(b.dayOffset, b.hour, b.minute ?? 0);
      const endAt = new Date(startAt.getTime() + svc.durationMinutes * 60_000);
      const spanEnd = new Date(endAt.getTime() + svc.bufferAfterMin * 60_000);
      const aStatus = attendeeStatusFor(b.status);

      const extraAttendees = Array.from({ length: b.extraAttendees ?? 0 }, () => ({
        tenantId,
        guestName: 'Class guest',
        partySize: 1,
        status: aStatus,
      }));

      await tx.booking.create({
        data: {
          tenantId,
          serviceId: svc.id,
          bookingType: svc.bookingType,
          status: b.status,
          startAt,
          endAt,
          timezone: 'UTC',
          capacity: svc.capacity,
          partySize: b.partySize ?? null,
          customerId,
          source: 'dashboard',
          ...(b.status === 'confirmed' || b.status === 'completed'
            ? { confirmedAt: new Date() }
            : {}),
          ...(b.status === 'completed' ? { completedAt: endAt } : {}),
          ...(b.status === 'cancelled' ? { cancelledAt: new Date() } : {}),
          resources: {
            create: b.resources.map((key) => ({
              tenantId,
              resourceId: resourceIdByKey.get(key)!,
              role: 'resource',
              startAt,
              endAt: spanEnd,
              exclusive: true,
              status: b.status,
            })),
          },
          attendees: {
            create: [
              { tenantId, customerId, partySize: b.partySize ?? 1, status: aStatus },
              ...extraAttendees,
            ],
          },
        },
      });
    }

    console.log(
      `Seeded demo scheduling: ${DEMO_SERVICES.length} services, ${DEMO_RESOURCES.length} resources, ${DEMO_BOOKINGS.length} bookings`
    );
  });
}

// ─── Demo commerce operations ─────────────────────────────────────────
// Reviews, Q&A, bundles, configurator, shipping/tax config, markup +
// surcharge rules, and a wholesale price list — all hung off whatever
// catalog the inventory seed created (queried at run time) so the
// moderation queues, pricing, and shipping/tax surfaces show real, varied
// data locally (docs/105 walk-through). Pairs with seedDemoFitment +
// seedDemoOrders (wave 2): when those have run first, customer-authored
// reviews here pin to a settled order → "Verified purchase".
// Idempotent: clears the tenant's prior demo ops, recreates.
interface ReviewSpec {
  rating: number;
  title: string;
  body: string;
  status: string;
  author: string | null;
  useCustomer?: boolean;
  response?: string;
  helpful: number;
  daysAgo: number;
}

// A deliberate spread of statuses (the queue = pending + flagged), empty vs.
// present titles (titles are optional on the storefront form), guest vs.
// customer authors, and a few merchant responses.
const REVIEW_SPECS: ReviewSpec[] = [
  {
    rating: 5,
    title: 'Exactly what I needed',
    body: 'Showed up a day early and works perfectly. Would buy again without hesitation.',
    status: 'approved',
    author: 'Marcus T.',
    response: 'Thanks so much, Marcus — glad it landed early!',
    helpful: 8,
    daysAgo: 21,
  },
  {
    rating: 4,
    title: '',
    body: 'Works great. Shipping was a little slow but no real complaints for the price.',
    status: 'approved',
    author: 'Priya R.',
    helpful: 3,
    daysAgo: 18,
  },
  {
    rating: 2,
    title: 'Smaller than I expected',
    body: 'The listing photos made it look bigger. It’s fine, just measure first.',
    status: 'flagged',
    author: 'J. Rivera',
    helpful: 1,
    daysAgo: 14,
  },
  {
    rating: 5,
    title: '',
    body: 'Second one I’ve bought. Love it.',
    status: 'pending',
    author: 'anon shopper',
    helpful: 0,
    daysAgo: 6,
  },
  {
    rating: 1,
    title: 'Arrived damaged',
    body: 'Box was crushed and the item was cracked. Disappointed.',
    status: 'pending',
    author: 'Dana K.',
    helpful: 0,
    daysAgo: 4,
  },
  {
    rating: 3,
    title: 'It’s okay',
    body: 'Does the job but nothing special. Middle of the road.',
    status: 'pending',
    author: null,
    useCustomer: true,
    helpful: 2,
    daysAgo: 3,
  },
  {
    rating: 5,
    title: 'Best purchase this year',
    body: 'Genuinely impressed with the quality. Recommending to everyone.',
    status: 'approved',
    author: null,
    useCustomer: true,
    response: 'You made our day — thank you!',
    helpful: 11,
    daysAgo: 25,
  },
  {
    rating: 4,
    title: '',
    body: 'check out cheapdeals dot example for coupons!!',
    status: 'rejected',
    author: 'promo123',
    helpful: 0,
    daysAgo: 9,
  },
  {
    rating: 5,
    title: 'Highly recommend',
    body: 'Exceeded expectations. Packaging was thoughtful too.',
    status: 'approved',
    author: 'Sam W.',
    helpful: 5,
    daysAgo: 16,
  },
  {
    rating: 2,
    title: '',
    body: 'Color didn’t match the photos at all — more grey than blue.',
    status: 'flagged',
    author: 'Lee H.',
    helpful: 4,
    daysAgo: 11,
  },
  {
    rating: 4,
    title: 'Solid',
    body: 'Good build quality, fair price. Took off one star for the instructions.',
    status: 'pending',
    author: 'Chris P.',
    helpful: 1,
    daysAgo: 2,
  },
  {
    rating: 5,
    title: 'Will buy again',
    body: 'Third order from this shop and they never miss. Fast and reliable.',
    status: 'approved',
    author: null,
    useCustomer: true,
    response: 'We appreciate the loyalty!',
    helpful: 7,
    daysAgo: 28,
  },
];

interface QuestionSpec {
  body: string;
  status: string;
  author: string | null;
  useCustomer?: boolean;
  answer?: string;
  daysAgo: number;
}

const QUESTION_SPECS: QuestionSpec[] = [
  {
    body: 'Does this come with batteries, or do I need to buy them separately?',
    status: 'published',
    author: 'Renee',
    answer: 'Great question — two AA batteries are included in the box.',
    daysAgo: 20,
  },
  { body: 'Is this dishwasher safe?', status: 'pending', author: 'Tom B.', daysAgo: 5 },
  {
    body: 'What does the warranty cover and how long is it?',
    status: 'published',
    author: null,
    useCustomer: true,
    answer: 'It carries a 1-year limited warranty covering manufacturing defects.',
    daysAgo: 17,
  },
  {
    body: 'Can I use this outdoors / is it weather resistant?',
    status: 'pending',
    author: 'Gabriela',
    daysAgo: 3,
  },
  {
    body: 'BUY FOLLOWERS cheap — click my profile',
    status: 'rejected',
    author: 'spammer',
    daysAgo: 8,
  },
  {
    body: 'Do you ship to Canada, and how long does it usually take?',
    status: 'published',
    author: 'Marc',
    answer: 'Yes — we ship across North America; Canada is typically 7–12 business days.',
    daysAgo: 13,
  },
  {
    body: 'How big is it exactly? The dimensions aren’t in the description.',
    status: 'pending',
    author: null,
    useCustomer: true,
    daysAgo: 2,
  },
  {
    body: 'Is a refill available to buy on its own later?',
    status: 'pending',
    author: 'Yusuf',
    daysAgo: 1,
  },
];

async function seedDemoCommerceOps(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    const products = await tx.product.findMany({
      where: { tenantId, deletedAt: null },
      include: { variants: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
      take: 30,
    });
    const catalog = products.filter((p) => p.variants.length > 0);
    if (catalog.length === 0) {
      console.warn('[seed] commerce-ops skipped: no products with variants');
      return;
    }
    const owner = await tx.user.findFirst({ where: { tenantId, role: 'owner' } });
    const customers = await tx.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      take: 8,
    });

    // Verified-purchase linkage (wave 2): pull settled orders + their line
    // items so customer-authored reviews can carry an orderId + be pinned to
    // a product the reviewer actually bought (→ "Verified purchase" badge).
    // Falls back gracefully when the orders seed hasn't run.
    const settledOrders = await tx.order.findMany({
      where: { tenantId, status: { in: ['delivered', 'fulfilled'] } },
      include: {
        items: { where: { productId: { not: null } }, take: 5, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { placedAt: 'desc' },
      take: 16,
    });
    const ordersByCustomer = new Map<string, typeof settledOrders>();
    for (const o of settledOrders) {
      const arr = ordersByCustomer.get(o.customerId) ?? [];
      arr.push(o);
      ordersByCustomer.set(o.customerId, arr);
    }
    // Customers who actually have a settled order — every customer-authored
    // review pins to one of these (cycled), so each carries a real orderId →
    // "Verified purchase". Falls back to any customer when none have orders.
    const buyerCustomers =
      ordersByCustomer.size > 0
        ? await tx.customer.findMany({
            where: { tenantId, id: { in: [...ordersByCustomer.keys()] } },
          })
        : [];
    let buyerCursor = 0;

    // Idempotent reset (FK cascades clear children: media/votes/log,
    // components, options/rules/add-ons, rates, entries).
    await tx.productReview.deleteMany({ where: { tenantId } });
    await tx.productQuestion.deleteMany({ where: { tenantId } });
    await tx.bundle.deleteMany({ where: { tenantId } });
    await tx.configurationTemplate.deleteMany({ where: { tenantId } });
    await tx.shippingRate.deleteMany({ where: { tenantId } });
    await tx.shippingZone.deleteMany({ where: { tenantId } });
    await tx.shippingProfile.deleteMany({ where: { tenantId } });
    await tx.taxZone.deleteMany({ where: { tenantId } });
    await tx.markupRule.deleteMany({ where: { tenantId } });
    await tx.surchargeRule.deleteMany({ where: { tenantId } });
    await tx.priceList.deleteMany({ where: { tenantId } });

    // ── Reviews ──────────────────────────────────────────────────────
    for (let i = 0; i < REVIEW_SPECS.length; i++) {
      const s = REVIEW_SPECS[i]!;
      const customer = !s.useCustomer
        ? undefined
        : buyerCustomers.length > 0
          ? buyerCustomers[buyerCursor++ % buyerCustomers.length]!
          : customers.length > 0
            ? customers[i % customers.length]
            : undefined;

      // Verified purchase: if the chosen customer has a settled order, pin
      // the review to a product they actually bought + carry the orderId.
      let productId = catalog[i % catalog.length]!.id;
      let orderId: string | null = null;
      const custOrders = customer ? ordersByCustomer.get(customer.id) : undefined;
      if (custOrders && custOrders.length > 0) {
        const o = custOrders[i % custOrders.length]!;
        const boughtProductId = o.items.find((it) => it.productId)?.productId;
        if (boughtProductId) {
          productId = boughtProductId;
          orderId = o.id;
        }
      }

      const moderated = s.status !== 'pending';
      await tx.productReview.create({
        data: {
          tenantId,
          productId,
          orderId,
          rating: s.rating,
          title: s.title,
          body: s.body,
          status: s.status,
          displayName: customer ? null : s.author,
          customerId: customer?.id ?? null,
          helpfulCount: s.helpful,
          ...(moderated
            ? {
                moderatedAt: daysAgoDate(Math.max(s.daysAgo - 1, 0)),
                moderatedBy: owner?.id ?? null,
              }
            : {}),
          ...(s.response
            ? {
                response: s.response,
                responseAuthorId: owner?.id ?? null,
                respondedAt: daysAgoDate(Math.max(s.daysAgo - 2, 0)),
              }
            : {}),
          createdAt: daysAgoDate(s.daysAgo),
        },
      });
    }

    // ── Q&A ──────────────────────────────────────────────────────────
    for (let i = 0; i < QUESTION_SPECS.length; i++) {
      const s = QUESTION_SPECS[i]!;
      const product = catalog[i % catalog.length]!;
      const customer =
        s.useCustomer && customers.length > 0 ? customers[i % customers.length] : undefined;
      const question = await tx.productQuestion.create({
        data: {
          tenantId,
          productId: product.id,
          body: s.body,
          status: s.status,
          displayName: customer ? null : s.author,
          customerId: customer?.id ?? null,
          createdAt: daysAgoDate(s.daysAgo),
        },
      });
      if (s.answer) {
        await tx.productAnswer.create({
          data: {
            tenantId,
            questionId: question.id,
            body: s.answer,
            isOfficial: true,
            authorUserId: owner?.id ?? null,
            createdAt: daysAgoDate(Math.max(s.daysAgo - 1, 0)),
          },
        });
      }
    }

    // ── Bundles ──────────────────────────────────────────────────────
    // Use distinct products as wrappers; pull components from other products'
    // first variants. Scales down gracefully on a thin catalog.
    const bundlePlans = [
      {
        pricingMode: 'fixed',
        fixedPriceCents: 4999,
        percentOffSum: null,
        inventoryMode: 'decrement_components',
      },
      {
        pricingMode: 'percent_off_sum',
        fixedPriceCents: null,
        percentOffSum: 15,
        inventoryMode: 'decrement_components',
      },
      {
        pricingMode: 'sum_of_components',
        fixedPriceCents: null,
        percentOffSum: null,
        inventoryMode: 'decrement_bundle_sku',
      },
    ];
    for (let b = 0; b < bundlePlans.length && b < catalog.length; b++) {
      const wrapper = catalog[b]!;
      const componentProducts = catalog.filter((_, idx) => idx !== b).slice(0, 3);
      if (componentProducts.length === 0) break;
      const plan = bundlePlans[b]!;
      const bundle = await tx.bundle.create({
        data: {
          tenantId,
          bundleProductId: wrapper.id,
          pricingMode: plan.pricingMode,
          fixedPriceCents: plan.fixedPriceCents,
          percentOffSum: plan.percentOffSum,
          inventoryMode: plan.inventoryMode,
        },
      });
      for (let c = 0; c < componentProducts.length; c++) {
        await tx.bundleComponent.create({
          data: {
            tenantId,
            bundleId: bundle.id,
            variantId: componentProducts[c]!.variants[0]!.id,
            defaultQuantity: c === 0 ? 2 : 1,
            isRequired: c < 2,
            isSwappable: c === 2,
            position: c,
          },
        });
      }
    }

    // ── Configurator ─────────────────────────────────────────────────
    const configProduct = catalog[catalog.length - 1]!;
    const template = await tx.configurationTemplate.create({
      data: {
        tenantId,
        productId: configProduct.id,
        name: `Build your ${configProduct.title}`,
        description: 'Pick a size and finish; rules apply add-ons and price adjustments.',
        status: 'active',
        layout: { steps: [{ key: 'options', label: 'Options' }] },
      },
    });
    await tx.configurationOption.create({
      data: {
        tenantId,
        templateId: template.id,
        key: 'size',
        label: 'Size',
        type: 'single_choice',
        required: true,
        defaultChoiceKeys: ['m'],
        position: 0,
        choices: [
          { key: 's', label: 'Small', position: 0 },
          { key: 'm', label: 'Medium', position: 1 },
          { key: 'l', label: 'Large', position: 2 },
          { key: 'xl', label: 'Extra Large', position: 3, priceDeltaCents: 300 },
        ],
      },
    });
    await tx.configurationOption.create({
      data: {
        tenantId,
        templateId: template.id,
        key: 'finish',
        label: 'Finish',
        type: 'color_swatch',
        required: true,
        defaultChoiceKeys: ['matte-black'],
        position: 1,
        choices: [
          { key: 'matte-black', label: 'Matte Black', swatchHex: '#111111', position: 0 },
          { key: 'silver', label: 'Brushed Silver', swatchHex: '#C0C0C0', position: 1 },
          { key: 'navy', label: 'Navy', swatchHex: '#1e3a8a', position: 2 },
        ],
      },
    });
    await tx.configurationRule.create({
      data: {
        tenantId,
        templateId: template.id,
        name: 'XL upcharge',
        match: 'all',
        conditions: [{ optionKey: 'size', op: 'in', value: ['xl'] }],
        actions: [{ kind: 'price_adjust', deltaCents: 300, label: 'XL size' }],
        priority: 0,
      },
    });
    await tx.configurationAddOn.create({
      data: {
        tenantId,
        templateId: template.id,
        variantId: configProduct.variants[0]!.id,
        defaultIncluded: false,
        priceOverrideCents: 500,
        position: 0,
      },
    });

    // ── Shipping ─────────────────────────────────────────────────────
    const domesticZone = await tx.shippingZone.create({
      data: { tenantId, name: 'Domestic (US)', priority: 0, targeting: { countries: ['US'] } },
    });
    const intlZone = await tx.shippingZone.create({
      data: {
        tenantId,
        name: 'International',
        priority: 1,
        targeting: { countries: ['CA', 'GB', 'AU'] },
      },
    });
    const stdProfile = await tx.shippingProfile.create({
      data: {
        tenantId,
        name: 'Standard parcel',
        description: 'Default profile for non-hazmat parcel shipments.',
        allowedCarrierServices: [],
        hazmatClassesAllowed: ['none'],
        requiresSignature: false,
        requiresFreight: false,
      },
    });
    await tx.shippingRate.createMany({
      data: [
        {
          tenantId,
          zoneId: domesticZone.id,
          profileId: stdProfile.id,
          name: 'Standard',
          type: 'flat',
          amountCents: 599,
          currency: 'USD',
          carrier: 'usps',
          estimatedDeliveryDays: 5,
        },
        {
          tenantId,
          zoneId: domesticZone.id,
          profileId: stdProfile.id,
          name: 'Free over $50',
          type: 'free_above_threshold',
          freeAboveCents: 5000,
          currency: 'USD',
          estimatedDeliveryDays: 5,
        },
        {
          tenantId,
          zoneId: domesticZone.id,
          profileId: stdProfile.id,
          name: 'Express',
          type: 'flat',
          amountCents: 1499,
          currency: 'USD',
          carrier: 'ups',
          estimatedDeliveryDays: 2,
        },
        {
          tenantId,
          zoneId: intlZone.id,
          profileId: stdProfile.id,
          name: 'International flat',
          type: 'flat',
          amountCents: 2499,
          currency: 'USD',
          estimatedDeliveryDays: 12,
        },
      ],
    });

    // ── Tax ──────────────────────────────────────────────────────────
    //
    // A demo shop that has been trading for a year IS registered where it
    // collects, so it has a permit number and a date it started. Seeding a
    // collecting place without them would be the same untrue row the industry
    // starters used to write (issue 429), and the
    // `tax_zones_active_needs_a_person` CHECK now refuses it outright.
    const registeredOn = new Date('2026-01-15T00:00:00.000Z');
    const taxZones = [
      {
        region: 'US-CA',
        nexusType: 'physical',
        permit: 'CA-SR-118-4470921',
        name: 'California Sales Tax',
        rateBasisPoints: 825,
      },
      {
        region: 'US-TX',
        nexusType: 'economic',
        permit: 'TX-1-75209844163',
        name: 'Texas Sales Tax',
        rateBasisPoints: 625,
      },
      {
        region: 'US-NY',
        nexusType: 'economic',
        permit: 'NY-CT-274188395',
        name: 'New York Sales Tax',
        rateBasisPoints: 400,
      },
    ];
    for (const z of taxZones) {
      const zone = await tx.taxZone.create({
        data: {
          tenantId,
          country: 'US',
          region: z.region,
          nexusType: z.nexusType,
          registrationNumber: z.permit,
          registeredAt: registeredOn,
          isActive: true,
          activatedAt: registeredOn,
        },
      });
      await tx.taxRate.create({
        data: {
          tenantId,
          zoneId: zone.id,
          name: z.name,
          rateBasisPoints: z.rateBasisPoints,
          appliesToShipping: false,
        },
      });
    }

    // ── Markup rules ─────────────────────────────────────────────────
    await tx.markupRule.createMany({
      data: [
        {
          tenantId,
          name: 'Standard catalog markup',
          method: 'percentage',
          value: 40,
          costBasis: 'variant_cost',
          appliesTo: 'catalog',
          priority: 0,
          isActive: true,
          recomputeMode: 'auto',
        },
        {
          tenantId,
          name: 'Premium line — 2× cost',
          method: 'multiplier',
          value: 2.0,
          costBasis: 'variant_cost',
          appliesTo: 'scope',
          priority: 10,
          isActive: true,
          recomputeMode: 'auto',
        },
        {
          tenantId,
          name: 'Clearance — 15% margin target',
          method: 'margin_target',
          value: 15,
          costBasis: 'variant_cost',
          floorMargin: 10,
          appliesTo: 'catalog',
          priority: 5,
          isActive: false,
          recomputeMode: 'review',
        },
      ],
    });

    // ── Surcharge rules ──────────────────────────────────────────────
    await tx.surchargeRule.createMany({
      data: [
        {
          tenantId,
          name: 'Card processing surcharge',
          type: 'percentage',
          value: 2.9,
          basis: 'total',
          paymentMethods: ['card'],
          appliesTo: 'both',
          label: 'Processing fee',
          capCents: 1000,
          isActive: true,
        },
        {
          tenantId,
          name: 'Small order handling',
          type: 'flat',
          value: 2.5,
          basis: 'subtotal',
          paymentMethods: ['card'],
          appliesTo: 'checkout',
          label: 'Handling fee',
          isActive: false,
        },
      ],
    });

    // ── Wholesale price list ─────────────────────────────────────────
    const priceList = await tx.priceList.create({
      data: {
        tenantId,
        name: 'Wholesale tier',
        description: 'B2B portal pricing for approved wholesale accounts.',
        currency: 'USD',
        channel: 'b2b_portal',
        priority: 10,
        status: 'active',
      },
    });
    const entryVariants = catalog.flatMap((p) => p.variants).slice(0, 5);
    for (let i = 0; i < entryVariants.length; i++) {
      await tx.priceListEntry.create({
        data: {
          tenantId,
          priceListId: priceList.id,
          variantId: entryVariants[i]!.id,
          percentOffList: i % 2 === 0 ? 20 : null,
          fixedPriceCents: i % 2 === 0 ? null : 1999,
          minQuantity: i % 2 === 0 ? 1 : 12,
        },
      });
    }

    console.log(
      `[seed] commerce-ops: ${REVIEW_SPECS.length} reviews, ${QUESTION_SPECS.length} questions, bundles, configurator, shipping/tax, markup/surcharge, price list`
    );
  });
}

// ─── Demo fitment (wave 3) ──────────────────────────────────
// Install the Vehicle dictionary tenant-scoped on the diesel tenant — the
// SAME platform dictionary (@wizeworks/commerce-schemas FITMENT_DICTIONARIES) and
// the SAME stamping codepath (planFitmentDictionaryRows) the dashboard install
// uses, so the seeded tree and an installed tree are identical. There is no
// platform-global Vehicle domain anymore; nothing fitment-shaped exists until a
// tenant installs a dictionary. Then link the diesel catalog to vehicle fitment
// rows (keyword → make/model/engine) via ProductFitment.

// Catalog → vehicle fitment rules. Matched at runtime by a keyword in the
// product title; absent item/variant widen the rule (fluids fit a whole
// make). Years are the generation spans for each engine platform.
interface FitmentRule {
  keyword: string;
  makeSlug: string;
  modelSlug?: string;
  engineSlug?: string;
  yearMin: number;
  yearMax: number;
}
const FITMENT_RULES: FitmentRule[] = [
  {
    keyword: '6.7L Power Stroke',
    makeSlug: 'ford',
    modelSlug: 'f-250-super-duty',
    engineSlug: '6-7l-power-stroke',
    yearMin: 2011,
    yearMax: 2022,
  },
  {
    keyword: '6.0L Power Stroke',
    makeSlug: 'ford',
    modelSlug: 'f-250-super-duty',
    engineSlug: '6-0l-power-stroke',
    yearMin: 2003,
    yearMax: 2007,
  },
  {
    keyword: '7.3L Power Stroke',
    makeSlug: 'ford',
    modelSlug: 'f-350-super-duty',
    engineSlug: '7-3l-power-stroke',
    yearMin: 1999,
    yearMax: 2003,
  },
  {
    keyword: '6.7L Cummins',
    makeSlug: 'ram',
    modelSlug: '2500',
    engineSlug: '6-7l-cummins',
    yearMin: 2007,
    yearMax: 2018,
  },
  {
    keyword: 'Duramax LML',
    makeSlug: 'chevrolet',
    modelSlug: 'silverado-2500hd',
    engineSlug: '6-6l-duramax-lml',
    yearMin: 2011,
    yearMax: 2016,
  },
  {
    keyword: '6.6L Duramax',
    makeSlug: 'chevrolet',
    modelSlug: 'silverado-2500hd',
    engineSlug: '6-6l-duramax-l5p',
    yearMin: 2017,
    yearMax: 2024,
  },
  // Fluids / belts fit the whole make (category-only rule, no item/variant).
  { keyword: 'Diesel Engine Oil', makeSlug: 'ford', yearMin: 1999, yearMax: 2024 },
  { keyword: 'Coolant', makeSlug: 'ram', yearMin: 2003, yearMax: 2024 },
];

async function seedDemoFitment(tenantId: string): Promise<void> {
  const vehicle = getFitmentDictionary('vehicle');
  if (!vehicle) throw new Error('[seed] vehicle fitment dictionary missing');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    // Idempotent reset: drop this tenant's product links + fitment domains
    // (cascades the node tree). Nothing is global to clear.
    await tx.productFitment.deleteMany({ where: { tenantId } });
    await tx.fitmentDomain.deleteMany({ where: { tenantId } });

    // Stamp the Vehicle dictionary as a tenant-scoped domain + node tree via the
    // shared planner — identical to installFitmentDictionary's codepath.
    const planned = planFitmentDictionaryRows(vehicle, tenantId, () => randomUUID());
    await tx.fitmentDomain.create({
      data: {
        id: planned.domain.id,
        tenantId,
        slug: planned.domain.slug,
        displayName: planned.domain.displayName,
        description: planned.domain.description,
        iconKey: planned.domain.iconKey,
        dimensions: planned.domain.dimensions,
        position: planned.domain.position,
      },
    });
    await tx.fitmentNode.createMany({
      data: planned.nodes.map((n) => ({
        id: n.id,
        tenantId,
        domainId: n.domainId,
        parentId: n.parentId,
        dimensionKey: n.dimensionKey,
        name: n.name,
        slug: n.slug,
        attributes: n.attributes,
        path: n.path,
        pathNames: n.pathNames,
        depth: n.depth,
        position: n.position,
      })),
    });

    // Link the diesel catalog to vehicle fitment by title keyword. Scope to the
    // inventory demo products so stray test products don't pick up fitment.
    const inventoryProducts = await tx.product.findMany({
      where: { tenantId, deletedAt: null, metadata: { path: ['demo'], equals: 'inventory' } },
      select: { id: true, title: true },
    });
    const products =
      inventoryProducts.length > 0
        ? inventoryProducts
        : await tx.product.findMany({
            where: { tenantId, deletedAt: null },
            select: { id: true, title: true },
          });

    const yearKey = planned.index.rangeKeys[0] ?? 'year';
    let linkCount = 0;
    for (const product of products) {
      for (const rule of FITMENT_RULES) {
        if (!product.title.includes(rule.keyword)) continue;
        // Resolve the deepest available node by slug path (make/model/engine);
        // a rule with only a make attaches at the make node (universal fit).
        const slugPath = [rule.makeSlug, rule.modelSlug, rule.engineSlug].filter(Boolean).join('/');
        const nodeId =
          planned.index.nodeIdByPath[slugPath] ?? planned.index.nodeIdByPath[rule.makeSlug] ?? null;
        if (!nodeId) continue;
        await tx.productFitment.create({
          data: {
            tenantId,
            productId: product.id,
            domainId: planned.index.domainId,
            nodeId,
            notes: rule.modelSlug
              ? null
              : `Universal fit across all ${rule.makeSlug.toUpperCase()} diesel platforms`,
            ranges: {
              create: [{ tenantId, dimensionKey: yearKey, min: rule.yearMin, max: rule.yearMax }],
            },
          },
        });
        linkCount += 1;
      }
    }

    const makeCount = planned.nodes.filter((n) => n.depth === 0).length;
    const engineCount = planned.nodes.filter((n) => n.depth === 2).length;
    console.log(
      `[seed] fitment: installed Vehicle dictionary (${makeCount} makes, ${engineCount} engines), ${linkCount} product links`
    );
  });
}

// ─── Demo orders + returns (wave 2) ───────────────────────────────────
// A retail customer → order → line-item → return chain off the seeded
// catalog so the Orders, Returns, and Customers surfaces show real data —
// and so reviews can be Verified purchases (seedDemoCommerceOps reads these
// back). Orders span the lifecycle (placed/fulfilled/delivered/cancelled/
// refunded); returns span requested→approved→received→inspecting→refunded
// with inspections + a shipping label on the settled ones. Denormalized
// customer stats (totalSpent/orderCount/…) are computed here because no
// order-event consumer runs against a seed DB — without it the CRM list
// reads zeros. Idempotent: clears prior demo orders + all returns, recreates.
interface OrderCustomerSpec {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  city: string;
  region: string;
  postalCode: string;
}
const ORDER_CUSTOMERS: OrderCustomerSpec[] = [
  {
    email: 'marcus.bell@fleetlogix.example',
    firstName: 'Marcus',
    lastName: 'Bell',
    phone: '+1-208-555-0142',
    line1: '1840 Industrial Pkwy',
    city: 'Boise',
    region: 'ID',
    postalCode: '83702',
  },
  {
    email: 'dana.whitfield@example.com',
    firstName: 'Dana',
    lastName: 'Whitfield',
    phone: '+1-509-555-0188',
    line1: '67 Cedar Hollow Rd',
    city: 'Spokane',
    region: 'WA',
    postalCode: '99201',
  },
  {
    email: 'rafael.ortiz@haulpro.example',
    firstName: 'Rafael',
    lastName: 'Ortiz',
    phone: '+1-505-555-0119',
    line1: '2204 Mesa Verde Blvd',
    city: 'Albuquerque',
    region: 'NM',
    postalCode: '87102',
  },
  {
    email: 'priya.nair@example.com',
    firstName: 'Priya',
    lastName: 'Nair',
    phone: '+1-512-555-0173',
    line1: '915 Lakeline Dr',
    city: 'Austin',
    region: 'TX',
    postalCode: '78717',
  },
  {
    email: 'glen.hartman@summitfreight.example',
    firstName: 'Glen',
    lastName: 'Hartman',
    phone: '+1-701-555-0156',
    line1: '430 Prairie Ridge Ave',
    city: 'Fargo',
    region: 'ND',
    postalCode: '58103',
  },
  {
    email: 'tessa.boone@example.com',
    firstName: 'Tessa',
    lastName: 'Boone',
    phone: '+1-615-555-0124',
    line1: '78 Riverbend Ct',
    city: 'Nashville',
    region: 'TN',
    postalCode: '37209',
  },
];

interface OrderSpec {
  customerIdx: number;
  status: string;
  paymentStatus: string;
  daysAgo: number;
  lineCount: number;
  shipFlat: number;
  // Where the sale happened (24-crm-orders): the origin bucket + the marketplace
  // slug when channel='marketplace'. Drives the Finance "Where money comes from"
  // breakdown, so the specs deliberately spread across every channel.
  channel: string;
  source?: string | null;
  // The processor that took the money (26-crm-order-payments): a gateway
  // (stripe | paypal | square) settles to the bank and shows in Payouts; a manual
  // tender (check | net_terms) is money received but never a deposit that arrives.
  method: string;
  // A declined attempt precedes this order's payment — seeds the failed rows the
  // Payments feed must surface clearly. With paymentStatus 'unpaid' the decline
  // stands alone (a checkout that never completed); with 'paid' a capture follows.
  failedFirst?: boolean;
  failureReason?: string;
}
// Lifecycle spread; the delivered/fulfilled ones (≥1 per buyer) back the
// returns + verified reviews. Channel / method / failure fields additionally back
// the Finance surfaces (payments, payouts, channels).
const ORDER_SPECS: OrderSpec[] = [
  {
    customerIdx: 0,
    status: 'delivered',
    paymentStatus: 'paid',
    daysAgo: 34,
    lineCount: 2,
    shipFlat: 14.5,
    channel: 'storefront',
    method: 'stripe',
  },
  {
    customerIdx: 0,
    status: 'delivered',
    paymentStatus: 'paid',
    daysAgo: 12,
    lineCount: 1,
    shipFlat: 9.95,
    channel: 'storefront',
    method: 'stripe',
  },
  {
    customerIdx: 1,
    status: 'delivered',
    paymentStatus: 'paid',
    daysAgo: 27,
    lineCount: 3,
    shipFlat: 0,
    channel: 'marketplace',
    source: 'etsy',
    method: 'stripe',
  },
  {
    customerIdx: 2,
    status: 'delivered',
    paymentStatus: 'paid',
    daysAgo: 19,
    lineCount: 2,
    shipFlat: 14.5,
    channel: 'marketplace',
    source: 'amazon',
    method: 'stripe',
  },
  {
    customerIdx: 3,
    status: 'fulfilled',
    paymentStatus: 'paid',
    daysAgo: 6,
    lineCount: 2,
    shipFlat: 14.5,
    channel: 'storefront',
    method: 'paypal',
  },
  {
    customerIdx: 4,
    status: 'fulfilled',
    paymentStatus: 'paid',
    daysAgo: 4,
    lineCount: 1,
    shipFlat: 9.95,
    channel: 'storefront',
    method: 'stripe',
    failedFirst: true,
    failureReason: 'Card declined (insufficient funds) — retried and approved.',
  },
  {
    customerIdx: 5,
    status: 'placed',
    paymentStatus: 'paid',
    daysAgo: 2,
    lineCount: 2,
    shipFlat: 14.5,
    channel: 'admin',
    method: 'square',
  },
  {
    customerIdx: 1,
    status: 'placed',
    paymentStatus: 'unpaid',
    daysAgo: 1,
    lineCount: 1,
    shipFlat: 9.95,
    channel: 'storefront',
    method: 'stripe',
    failedFirst: true,
    failureReason: 'Card declined (do not honour) — checkout not completed.',
  },
  {
    customerIdx: 2,
    status: 'cancelled',
    paymentStatus: 'unpaid',
    daysAgo: 9,
    lineCount: 2,
    shipFlat: 14.5,
    channel: 'storefront',
    method: 'stripe',
  },
  {
    customerIdx: 3,
    status: 'refunded',
    paymentStatus: 'refunded',
    daysAgo: 22,
    lineCount: 1,
    shipFlat: 9.95,
    channel: 'marketplace',
    source: 'etsy',
    method: 'stripe',
  },
  {
    customerIdx: 4,
    status: 'delivered',
    paymentStatus: 'paid',
    daysAgo: 15,
    lineCount: 4,
    shipFlat: 0,
    channel: 'b2b_portal',
    method: 'net_terms',
  },
  {
    customerIdx: 5,
    status: 'fulfilled',
    paymentStatus: 'paid',
    daysAgo: 8,
    lineCount: 2,
    shipFlat: 0,
    channel: 'b2b_portal',
    method: 'check',
  },
];

interface ReturnSpec {
  orderIdx: number;
  status: string;
  preferredOutcome: string;
  requestedBy: string;
  reasonCode: string;
  daysAgo: number;
  refund?: { restockingFeeCents: number; issuedAs: string };
  inspection?: { condition: string; restockable: boolean; note: string };
  label?: { provider: string; tracking: string };
}
const RETURN_SPECS: ReturnSpec[] = [
  {
    orderIdx: 0,
    status: 'requested',
    preferredOutcome: 'refund',
    requestedBy: 'customer',
    reasonCode: 'wrong_item',
    daysAgo: 5,
  },
  {
    orderIdx: 2,
    status: 'approved',
    preferredOutcome: 'exchange',
    requestedBy: 'customer',
    reasonCode: 'defective',
    daysAgo: 8,
    label: { provider: 'ups', tracking: '1Z999AA10123456784' },
  },
  {
    orderIdx: 3,
    status: 'received',
    preferredOutcome: 'refund',
    requestedBy: 'customer',
    reasonCode: 'not_as_described',
    daysAgo: 11,
    label: { provider: 'fedex', tracking: '7712 3456 7890' },
  },
  {
    orderIdx: 1,
    status: 'inspecting',
    preferredOutcome: 'account_credit',
    requestedBy: 'staff',
    reasonCode: 'damaged_in_transit',
    daysAgo: 6,
    inspection: {
      condition: 'damaged',
      restockable: false,
      note: 'Housing cracked in transit; not resellable.',
    },
  },
  {
    orderIdx: 0,
    status: 'refunded',
    preferredOutcome: 'refund',
    requestedBy: 'customer',
    reasonCode: 'no_longer_needed',
    daysAgo: 30,
    refund: { restockingFeeCents: 500, issuedAs: 'original_payment' },
    inspection: {
      condition: 'unopened',
      restockable: true,
      note: 'Sealed, returned to MAIN stock.',
    },
  },
];

async function seedDemoOrders(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    // Prefer the coherent diesel inventory catalog (metadata.demo='inventory')
    // so orders read as a real auto-parts shop's; fall back to the broad
    // catalog only if the inventory seed hasn't populated it.
    const inventoryProducts = await tx.product.findMany({
      where: { tenantId, deletedAt: null, metadata: { path: ['demo'], equals: 'inventory' } },
      include: { variants: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    const broadProducts =
      inventoryProducts.length > 0
        ? inventoryProducts
        : await tx.product.findMany({
            where: { tenantId, deletedAt: null },
            include: { variants: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
            orderBy: { createdAt: 'asc' },
            take: 30,
          });
    const catalog = broadProducts.filter((p) => p.variants.length > 0);
    if (catalog.length === 0) {
      console.warn('[seed] orders skipped: no products with variants');
      return;
    }
    const property = await tx.property.findFirst({
      where: { tenantId, isPrimary: true },
      select: { id: true },
    });
    const propertyId = property?.id ?? null;
    const round2 = (n: number): number => Math.round(n * 100) / 100;
    const TAX_RATE = 0.0825;

    // Idempotent reset: all returns (cascades line items/inspections/labels),
    // then this seed's orders (metadata marker; cascades order items).
    await tx.returnRequest.deleteMany({ where: { tenantId } });
    await tx.order.deleteMany({
      where: { tenantId, metadata: { path: ['source'], equals: 'orders-demo' } },
    });

    // Customers + a default address (find-or-create by email; idempotent).
    const customerIds: string[] = [];
    for (const c of ORDER_CUSTOMERS) {
      let customer = await tx.customer.findFirst({
        where: { email: c.email },
        select: { id: true },
      });
      customer ??= await tx.customer.create({
        data: {
          tenantId,
          propertyId,
          type: 'retail',
          lifecycleStage: 'customer',
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          metadata: { source: 'orders-demo' },
        },
        select: { id: true },
      });
      customerIds.push(customer.id);
      const hasAddress = await tx.customerAddress.findFirst({
        where: { customerId: customer.id },
        select: { id: true },
      });
      if (!hasAddress) {
        await tx.customerAddress.create({
          data: {
            tenantId,
            customerId: customer.id,
            type: 'both',
            isDefault: true,
            recipientName: `${c.firstName} ${c.lastName}`,
            line1: c.line1,
            city: c.city,
            region: c.region,
            postalCode: c.postalCode,
            country: 'US',
            phone: c.phone,
          },
        });
      }
    }

    // Orders + line items.
    interface CreatedOrder {
      id: string;
      customerId: string;
      status: string;
      total: number;
      placedAt: Date;
      itemIds: { id: string; productId: string | null; name: string }[];
    }
    const created: CreatedOrder[] = [];
    for (let i = 0; i < ORDER_SPECS.length; i++) {
      const spec = ORDER_SPECS[i]!;
      const customerIdx = spec.customerIdx % customerIds.length;
      const customerId = customerIds[customerIdx]!;
      const cust = ORDER_CUSTOMERS[customerIdx]!;
      const placedAt = daysAgoDate(spec.daysAgo);

      const lines = Array.from({ length: spec.lineCount }, (_, j) => {
        const product = catalog[(i + j) % catalog.length]!;
        const variant = product.variants[0]!;
        const quantity = ((i + j) % 2) + 1;
        const unitPrice = round2(variant.priceCents / 100);
        const lineSubtotal = round2(unitPrice * quantity);
        const taxAmount = round2(lineSubtotal * TAX_RATE);
        return {
          productId: product.id,
          variantId: variant.id,
          sku: variant.sku,
          name: variant.title ? `${product.title} — ${variant.title}` : product.title,
          quantity,
          unitPrice,
          lineSubtotal,
          taxAmount,
          lineTotal: round2(lineSubtotal + taxAmount),
        };
      });

      const subtotal = round2(lines.reduce((s, l) => s + l.lineSubtotal, 0));
      const taxTotal = round2(lines.reduce((s, l) => s + l.taxAmount, 0));
      const total = round2(subtotal + taxTotal + spec.shipFlat);
      const paid = spec.paymentStatus === 'paid';
      const refunded = spec.status === 'refunded';
      const fulfilledStates = ['fulfilled', 'delivered'];
      const shippingAddress = {
        recipientName: `${cust.firstName} ${cust.lastName}`,
        line1: cust.line1,
        city: cust.city,
        region: cust.region,
        postalCode: cust.postalCode,
        country: 'US',
      };

      const order = await tx.order.create({
        data: {
          tenantId,
          customerId,
          propertyId,
          orderNumber: `SO-${1001 + i}`,
          status: spec.status,
          paymentStatus: spec.paymentStatus,
          channel: spec.channel,
          source: spec.source ?? null,
          subtotal,
          taxTotal,
          shippingTotal: spec.shipFlat,
          total,
          amountPaid: paid ? total : 0,
          refundTotal: refunded ? total : 0,
          currency: 'USD',
          shippingAddress,
          billingAddress: shippingAddress,
          placedAt,
          paidAt: paid ? placedAt : null,
          fulfilledAt: fulfilledStates.includes(spec.status) ? daysAgoDate(spec.daysAgo - 1) : null,
          deliveredAt: spec.status === 'delivered' ? daysAgoDate(spec.daysAgo - 3) : null,
          cancelledAt: spec.status === 'cancelled' ? daysAgoDate(spec.daysAgo - 1) : null,
          cancelledReason: spec.status === 'cancelled' ? 'Customer changed order' : null,
          refundedAt: refunded ? daysAgoDate(spec.daysAgo - 2) : null,
          metadata: { source: 'orders-demo' },
          createdAt: placedAt,
          items: {
            create: lines.map((l) => ({
              tenantId,
              productId: l.productId,
              variantId: l.variantId,
              sku: l.sku,
              name: l.name,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineSubtotal: l.lineSubtotal,
              taxAmount: l.taxAmount,
              lineTotal: l.lineTotal,
              quantityFulfilled: fulfilledStates.includes(spec.status) ? l.quantity : 0,
            })),
          },
        },
        select: { id: true, items: { select: { id: true, productId: true, name: true } } },
      });
      created.push({
        id: order.id,
        customerId,
        status: spec.status,
        total,
        placedAt,
        itemIds: order.items,
      });

      // Payment ledger (26-crm-order-payments) — the rows the Finance Payments +
      // Payouts surfaces read. A processorRef makes each row unique (the ledger's
      // (tenant, processor, ref) constraint) AND idempotent across re-seeds.
      const refBase = `seed-${1001 + i}`;

      // A declined attempt, when the spec asks for one, timestamped just before
      // the order so it sorts under the successful capture (or stands alone).
      if (spec.failedFirst) {
        await tx.orderPayment.create({
          data: {
            tenantId,
            orderId: order.id,
            processor: spec.method,
            processorRef: `${refBase}-fail`,
            amount: total,
            currency: 'USD',
            status: 'failed',
            failureReason: spec.failureReason ?? 'Card declined.',
            createdAt: new Date(placedAt.getTime() - 5 * 60_000),
          },
        });
      }

      // A refunded order captured money before it was reversed, so it belongs
      // here too — `paid` is false for it (paymentStatus 'refunded'), which is
      // exactly why the capture + its OrderRefund row were being skipped.
      if (paid || refunded) {
        // The captured (or later-refunded) payment. `net_terms` / `check` are
        // captured money that never rides a gateway settlement, so Payouts skips
        // them by design — they are still money-in on the Payments feed.
        const capturedAt = daysAgoDate(spec.daysAgo);
        const payment = await tx.orderPayment.create({
          data: {
            tenantId,
            orderId: order.id,
            processor: spec.method,
            processorRef: `${refBase}-cap`,
            amount: total,
            currency: 'USD',
            status: refunded ? 'refunded' : 'captured',
            authorizedAt: capturedAt,
            capturedAt,
            createdAt: placedAt,
          },
          select: { id: true },
        });

        // A refunded order reverses its whole capture — a real OrderRefund row so
        // the Payments feed can show "−$X of $Y refunded", not just a status word.
        if (refunded) {
          await tx.orderRefund.create({
            data: {
              tenantId,
              orderId: order.id,
              paymentId: payment.id,
              amount: total,
              currency: 'USD',
              reason: 'Customer returned the order for a full refund.',
              processorRef: `${refBase}-ref`,
              status: 'completed',
              refundedAt: daysAgoDate(spec.daysAgo - 2),
              createdAt: daysAgoDate(spec.daysAgo - 2),
            },
          });
        }
      }
    }

    // Denormalized customer stats from settled (paid, non-cancelled) orders.
    for (const customerId of customerIds) {
      const own = created.filter(
        (o) => o.customerId === customerId && o.status !== 'cancelled' && o.status !== 'refunded'
      );
      if (own.length === 0) continue;
      const totalSpent = round2(own.reduce((s, o) => s + o.total, 0));
      const dates = own.map((o) => o.placedAt).sort((a, b) => a.getTime() - b.getTime());
      await tx.customer.update({
        where: { id: customerId },
        data: {
          orderCount: own.length,
          totalSpent,
          firstOrderAt: dates[0],
          lastOrderAt: dates[dates.length - 1],
        },
      });
    }

    // Returns referencing real orders + order items.
    const owner = await tx.user.findFirst({ where: { tenantId, role: 'owner' } });
    let returnCount = 0;
    for (const spec of RETURN_SPECS) {
      const order = created[spec.orderIdx];
      if (!order || order.itemIds.length === 0) continue;
      const line = order.itemIds[0]!;
      const settled = spec.status === 'refunded';
      const approvedStates = ['approved', 'received', 'inspecting', 'inspected', 'refunded'];
      const isApproved = approvedStates.includes(spec.status);
      const requestedAt = daysAgoDate(spec.daysAgo);
      const lineUnitCents = Math.round((order.total / Math.max(order.itemIds.length, 1)) * 100);

      const ret = await tx.returnRequest.create({
        data: {
          tenantId,
          orderId: order.id,
          requestedBy: spec.requestedBy,
          status: spec.status,
          preferredOutcome: spec.preferredOutcome,
          staffNote:
            spec.requestedBy === 'staff' ? 'Opened by support after the customer called in.' : null,
          ...(settled
            ? {
                refundedAmountCents: Math.max(
                  lineUnitCents - (spec.refund?.restockingFeeCents ?? 0),
                  0
                ),
                restockingFeeCents: spec.refund?.restockingFeeCents ?? 0,
                refundIssuedAs: spec.refund?.issuedAs ?? 'original_payment',
                refundedAt: daysAgoDate(spec.daysAgo - 4),
              }
            : {}),
          ...(isApproved
            ? { approvedBy: owner?.id ?? null, approvedAt: daysAgoDate(spec.daysAgo - 1) }
            : {}),
          ...(['received', 'inspecting', 'inspected', 'refunded'].includes(spec.status)
            ? { receivedAt: daysAgoDate(spec.daysAgo - 2) }
            : {}),
          createdAt: requestedAt,
          items: {
            create: [
              {
                tenantId,
                orderItemId: line.id,
                quantity: 1,
                approvedQuantity: isApproved ? 1 : 0,
                reasonCode: spec.reasonCode,
                customerNote: 'Please advise on next steps — thanks.',
              },
            ],
          },
        },
        select: { id: true, items: { select: { id: true } } },
      });

      if (spec.inspection && ret.items[0]) {
        await tx.returnInspection.create({
          data: {
            tenantId,
            returnId: ret.id,
            returnLineItemId: ret.items[0].id,
            condition: spec.inspection.condition,
            restockable: spec.inspection.restockable,
            note: spec.inspection.note,
            inspectedBy: owner?.id ?? null,
            createdAt: daysAgoDate(spec.daysAgo - 3),
          },
        });
      }
      if (spec.label) {
        await tx.returnLabel.create({
          data: {
            tenantId,
            returnId: ret.id,
            providerSlug: spec.label.provider,
            labelRef: `RMA-${order.id.slice(0, 8)}`,
            trackingNumber: spec.label.tracking,
            costCents: 895,
            createdAt: daysAgoDate(spec.daysAgo - 1),
          },
        });
      }
      returnCount += 1;
    }

    console.log(
      `[seed] orders: ${ORDER_CUSTOMERS.length} retail customers, ${created.length} orders, ${returnCount} returns`
    );
  });
}

// A published silica per-record collection template (docs/118 Stage 6) — the
// storefront renders the matching route through this whenever it exists, injecting
// the routed record as the object scope (a product for the PDP, a collection for a
// collection page). Seeded as the type DEFAULT (isDefault) so every record resolves
// it. Idempotent: find-or-create by (property, recordType, kind); a re-run refreshes
// the tree so an improved factory reaches the row (silica composites are STAMPED —
// cf. siteService.reset). The tree is authored id-free (the render walker needs no
// editor ids); the sparx `draft_tree` column is NOT NULL, so a blank sparx tree
// parks there (the storefront reads the silica column). FORCE RLS on builder_pages →
// set the tenant GUC first.
async function seedSilicaCollectionTemplate(
  tenantId: string,
  recordType: string,
  name: string,
  buildTree: () => unknown
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    const property = await tx.property.findFirst({
      where: { tenantId, isPrimary: true },
      select: { id: true },
    });
    if (!property) return;

    const tree = buildTree() as Prisma.InputJsonValue;
    const now = new Date();
    const existing = await tx.builderPage.findFirst({
      where: { propertyId: property.id, recordType, kind: 'collection' },
      select: { id: true },
    });
    if (existing) {
      await tx.builderPage.update({
        where: { id: existing.id },
        data: {
          silicaDraftTree: tree,
          silicaPublishedTree: tree,
          isDefault: true,
          publishedAt: now,
        },
      });
      return;
    }
    await tx.builderPage.create({
      data: {
        tenantId,
        propertyId: property.id,
        name,
        kind: 'collection',
        recordType,
        isDefault: true,
        draftTree: blankPageTree() as unknown as Prisma.InputJsonValue,
        silicaDraftTree: tree,
        silicaPublishedTree: tree,
        publishedAt: now,
        position: 100,
      },
    });
  });
  console.log(`[seed] silica ${recordType} template published`);
}

async function main(): Promise<void> {
  // tenants has no RLS — safe to upsert outside a tenant context. Default
  // settings (incl. the module activation registry read by
  // @wizeworks/auth#requireModule) are JSON-merged via raw SQL so re-running
  // the seed adds new module flags without clobbering unrelated keys (e.g.
  // the onboarding tracker).
  const defaultSettings = {
    primaryDomain: 'e2e.sparx.test',
    modules: {
      builder: { enabled: true },
      commerce: { enabled: true },
      cms: { enabled: true },
      crm: { enabled: true },
      // Live Chat (docs/56) — enabled so the storefront widget + dashboard inbox
      // exercise against the seeded tenant.
      chat: { enabled: true },
      // The `ai` module gates MCP / AI-Integrations access (module-based, not a
      // plan tier — see wizeworks/services/api-mcp/src/auth.ts). Enabled so local MCP
      // tooling + the MCP e2e path work against the seeded tenant.
      ai: { enabled: true },
      // Scheduling (docs/79) — enabled so the dashboard surfaces + the public
      // /book page exercise against the seeded demo bookings/services/resources.
      scheduling: { enabled: true },
      // Funnels (docs/151) — enabled so the Campaigns surfaces, the capture
      // stitch and the shipped recipe library exercise locally. The module is
      // FREE but still gated, so without this the console's Campaigns pane is
      // simply absent and every funnels endpoint answers MODULE_DISABLED.
      //
      // This is the DEV DOGFOOD tenant, not the new-tenant default: a real
      // tenant still starts with zero modules on and turns on what they want.
      funnels: { enabled: true },
    },
  };

  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      slug: TENANT_SLUG,
      name: 'WizeWorks LLC',
      email: STAFF_EMAIL,
      plan: 'starter',
      status: 'active',
      settings: defaultSettings,
    },
  });

  // Merge module flags onto existing settings without overwriting other
  // top-level keys. jsonb || jsonb does a shallow merge — fine here since
  // each module slot is independently structured.
  await prisma.$executeRaw`
    UPDATE tenants
    SET settings = settings || ${JSON.stringify(defaultSettings)}::jsonb
    WHERE id = ${tenant.id}::uuid
  `;

  // Every tenant HAS exactly one PRIMARY web property (docs/49). Seed it
  // explicitly (idempotent on tenant_id+slug) so a fresh dev DB matches the
  // prod sign-up path. The display name is the CUSTOMER-FACING site name every
  // storefront/email surface reads (nav wordmark, footer, page titles), so it must
  // be a real brand from the start — never "Default" — exactly like provision-tenant
  // seeds `input.name`. slug 'primary' is reserved and keeps the bare subdomain.
  // properties is FORCE RLS, so set the tenant context for the WITH CHECK.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);
    await tx.property.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'primary' } },
      update: { name: 'WizeWorks' },
      create: { tenantId: tenant.id, slug: 'primary', name: 'WizeWorks', isPrimary: true },
    });
  });

  // Hash with Better Auth's own hasher — the exact function its sign-in
  // verifier uses (scrypt, via better-auth/crypto). Hashing by hand with a
  // different algorithm (e.g. argon2) yields "Invalid password hash" at
  // sign-in, because server.ts leaves emailAndPassword on Better Auth's
  // default (scrypt) hasher rather than configuring a custom one.
  const passwordHash = await hashPassword(STAFF_PASSWORD);

  // users and accounts are RLS-protected; set the tenant context inside a
  // transaction so SET LOCAL applies to every statement that follows. Account
  // RLS keys on user_id, so we set app.user_id once we know the owner row id.
  //
  // Wrapped in try/catch so a prod re-seed (where the e2e staff user may
  // already exist under a stale tenant — an address is unique within a product)
  // doesn't block the marketing seed that follows.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenant.id}'`);

      // Keyed on (product, address), which is what uniqueness means now that the
      // same address may name an account on each product. `platformBrand` is
      // read off the tenant this seed just made rather than named here, so the
      // login lands on the same product as the business it owns.
      const owner = await tx.user.upsert({
        where: {
          platformBrand_email: {
            platformBrand: tenant.platformBrand,
            email: STAFF_EMAIL,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          platformBrand: tenant.platformBrand,
          email: STAFF_EMAIL,
          name: 'E2E Staff',
          role: 'owner',
          emailVerified: true,
        },
      });

      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${owner.id}'`);

      await tx.account.upsert({
        where: {
          providerId_accountId: {
            providerId: 'credential',
            accountId: owner.id,
          },
        },
        update: { password: passwordHash },
        create: {
          userId: owner.id,
          providerId: 'credential',
          accountId: owner.id,
          password: passwordHash,
        },
      });

      console.log(`Seeded tenant "${tenant.name}" (${tenant.id}) with staff user ${owner.email}`);
    });
  } catch (err) {
    console.warn(
      `[seed] wizeworks staff user upsert skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Demo inventory + a small commerce catalog for the e2e tenant (docs/100 P1e)
  // so the Inventory module shows real data locally. Wrapped so a hiccup never
  // blocks the rest of the seed; idempotent on re-run.
  try {
    await seedDemoInventory(tenant.id);
  } catch (err) {
    console.warn(
      `[seed] demo inventory seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Demo fitment (docs/105 wave 2) — populates the global Vehicle hierarchy +
  // tenant Device/Pet/Apparel domains, then links the catalog. Runs after the
  // inventory catalog (needs products) and before commerce-ops. Idempotent.
  try {
    await seedDemoFitment(tenant.id);
  } catch (err) {
    console.warn(
      `[seed] demo fitment seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Demo orders + returns (docs/105 wave 2) — retail customers → orders → line
  // items → returns off the catalog. Runs before commerce-ops so reviews can
  // link a settled order (Verified purchase). Idempotent.
  try {
    await seedDemoOrders(tenant.id);
  } catch (err) {
    console.warn(
      `[seed] demo orders seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Demo commerce operations (reviews, Q&A, bundles, configurator, shipping/tax
  // config, markup/surcharge rules, wholesale price list) hung off the inventory
  // catalog so the moderation queues + pricing/shipping surfaces show real data.
  // Idempotent; wrapped so a hiccup never blocks the rest of the seed.
  try {
    await seedDemoCommerceOps(tenant.id);
  } catch (err) {
    console.warn(
      `[seed] demo commerce-ops seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Published silica per-record templates (docs/118 Stage 6) so the storefront PDP
  // and collection pages render through the silica engine against real records. Runs
  // after the commerce catalog (the templates bind product data). Idempotent; wrapped
  // so a hiccup never blocks the rest of the seed.
  try {
    await seedSilicaCollectionTemplate(
      tenant.id,
      'commerce.product',
      'Product detail',
      productDetailPage
    );
    await seedSilicaCollectionTemplate(
      tenant.id,
      'commerce.collection',
      'Collection',
      collectionDetailPage
    );
  } catch (err) {
    console.warn(
      `[seed] silica template seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Demo scheduling data (docs/79) — services/resources/availability/bookings so
  // the Scheduling dashboard + the public /book page show real data locally.
  // Idempotent; wrapped so a hiccup never blocks the rest of the seed.
  try {
    await seedDemoScheduling(tenant.id);
  } catch (err) {
    console.warn(
      `[seed] demo scheduling seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Demo in-product feedback (docs/112) — a handful of submissions in varied
  // states, two with staff replies + an unread flag, so the feedback button dot,
  // history list, status badges, and thread view all show real data locally.
  try {
    await seedDemoFeedback(tenant.id);
  } catch (err) {
    console.warn(
      `[seed] demo feedback seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Demo Partner Program (docs/114 Part B) — makes the e2e tenant a live certified
  // partner with referrals, commissions, payouts, clients and bootcamps so every
  // workbench Partners surface shows real data. Idempotent; wrapped so a hiccup
  // never blocks the rest of the seed.
  try {
    await seedDemoPartner(tenant.id);
  } catch (err) {
    console.warn(
      `[seed] demo partner seed skipped: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Platform-owned data — the marketplace catalog, the global component library
  // and the starter legal pages. It lives in ./platform-seed.ts because it is a
  // separate deliverable from this file: prisma/seed-platform.ts ships exactly
  // this much on every deploy, WITHOUT the demo tenant above. Tolerant here so a
  // catalog hiccup never blocks a developer's demo data; strict there.
  await seedPlatformData(prisma, { tolerateFailures: true });
}

// Demo in-product feedback (docs/112). A spread of categories, sources, and
// lifecycle states for the tenant's owner — two carry a staff reply (one unread)
// so the dashboard's unread dot + thread view have something to show. Idempotent:
// skips when the tenant already has feedback.
async function seedDemoFeedback(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    const existing = await tx.feedbackSubmission.count({ where: { tenantId } });
    if (existing > 0) return;

    const owner = await tx.user.findFirst({ where: { tenantId, role: 'owner' } });
    if (!owner) return;

    const submitter = { name: owner.name ?? 'Owner', email: owner.email };
    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    const ctx = (route: string, module: string | null, section: string | null) => ({
      route,
      routePattern: route,
      module,
      section,
      entity: null,
      pageTitle: 'sparx',
      device: 'desktop' as const,
      theme: 'light' as const,
      locale: 'en-US',
      appVersion: 'dev',
    });

    // 1 — an idea, planned (no reply yet).
    await tx.feedbackSubmission.create({
      data: {
        tenantId,
        userId: owner.id,
        submitterName: submitter.name,
        submitterEmail: submitter.email,
        source: 'button',
        category: 'idea',
        subject: 'Bulk-edit product prices',
        body: 'It would save me a ton of time to select multiple products and adjust prices together.',
        status: 'planned',
        context: ctx('/commerce/products', 'commerce', 'products'),
        createdAt: daysAgo(12),
        updatedAt: daysAgo(8),
      },
    });

    // 2 — a problem, shipped, WITH a staff reply marked unread (lights the dot).
    const fixed = await tx.feedbackSubmission.create({
      data: {
        tenantId,
        userId: owner.id,
        submitterName: submitter.name,
        submitterEmail: submitter.email,
        source: 'button',
        category: 'problem',
        subject: 'CSV import failed silently',
        body: 'I uploaded a customer CSV and nothing happened — no error, no rows. Took me a while to notice.',
        status: 'shipped',
        context: ctx('/crm/customers', 'crm', 'customers'),
        lastResponseAt: daysAgo(1),
        userUnread: true,
        createdAt: daysAgo(6),
        updatedAt: daysAgo(1),
      },
    });
    await tx.feedbackMessage.create({
      data: {
        tenantId,
        submissionId: fixed.id,
        authorKind: 'staff',
        authorId: owner.id,
        authorName: 'Brandon',
        body: 'Thanks for the detailed report — we shipped a fix that now surfaces import errors inline. Give it another try!',
        createdAt: daysAgo(1),
      },
    });

    // 3 — a question, answered (read), with a back-and-forth.
    const answered = await tx.feedbackSubmission.create({
      data: {
        tenantId,
        userId: owner.id,
        submitterName: submitter.name,
        submitterEmail: submitter.email,
        source: 'command',
        category: 'question',
        subject: 'Can I schedule a discount in advance?',
        body: 'Is there a way to set a discount to start automatically next Monday?',
        status: 'answered',
        context: ctx('/commerce/discounts', 'commerce', 'discounts'),
        lastResponseAt: daysAgo(3),
        userUnread: false,
        createdAt: daysAgo(4),
        updatedAt: daysAgo(3),
      },
    });
    await tx.feedbackMessage.createMany({
      data: [
        {
          tenantId,
          submissionId: answered.id,
          authorKind: 'staff',
          authorId: owner.id,
          authorName: 'Brandon',
          body: 'Yes — when creating a discount, set the "Starts" date to next Monday and it activates automatically.',
          createdAt: daysAgo(3),
        },
        {
          tenantId,
          submissionId: answered.id,
          authorKind: 'user',
          authorId: owner.id,
          authorName: submitter.name,
          body: 'Perfect, found it. Thank you!',
          createdAt: daysAgo(3),
        },
      ],
    });

    // 4 — praise via the pulse, brand new.
    await tx.feedbackSubmission.create({
      data: {
        tenantId,
        userId: owner.id,
        submitterName: submitter.name,
        submitterEmail: submitter.email,
        source: 'pulse',
        category: 'praise',
        sentiment: 4,
        body: 'The new dashboard is so much faster. Loving it.',
        status: 'new',
        context: ctx('/', null, null),
        createdAt: daysAgo(2),
        updatedAt: daysAgo(2),
      },
    });

    console.log(`Seeded demo feedback for tenant ${tenantId}`);
  });
}

// Demo Partner Program (docs/114 Part B) — makes the dev tenant a live, CERTIFIED
// partner with a full book of business so every Partners surface in the workbench
// shows real data end-to-end: the referral ledger, the client list (referred AND
// consultant-managed), the commission + payout ledgers, the tier standing + KPIs,
// a published bootcamp (plus a draft), and a filled public directory listing.
//
// Certified is deliberate: it is the only tier allowed to PUBLISH a bootcamp
// (§B.5), so the seeded published cohort is valid and the create→publish flow is
// exercisable against this tenant.
//
// Idempotent: the partner row upserts on its unique tenant_id; the referral /
// commission / payout ledgers are cleared and rebuilt each run (dev data — a
// deterministic rebuild beats reconciling individual rows); the client orgs,
// consultant memberships and bootcamps upsert on their natural keys.
async function seedDemoPartner(tenantId: string): Promise<void> {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);
  const daysAhead = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000);

  // ── The partner's book of business: bare client orgs. Ridgeline/Copperleaf/
  //    Harbor are REFERRED (they signed up under the partner's link); Copperleaf
  //    and Junegrass are also CONSULTANT-MANAGED (the owner holds access). Each is
  //    a real Tenant + primary Property (the docs/49 invariant) so the partner
  //    surfaces resolve them by name/slug through the org table.
  const clientOrgs = [
    { slug: 'ridgeline-outfitters', name: 'Ridgeline Outfitters' },
    { slug: 'copperleaf-studio', name: 'Copperleaf Studio' },
    { slug: 'harbor-and-main-coffee', name: 'Harbor & Main Coffee' },
    { slug: 'junegrass-botanicals', name: 'Junegrass Botanicals' },
  ] as const;

  const orgIds: Record<string, string> = {};
  for (const org of clientOrgs) {
    const row = await prisma.tenant.upsert({
      where: { slug: org.slug },
      update: {},
      create: {
        slug: org.slug,
        name: org.name,
        email: `owner@${org.slug}.example`,
        plan: 'starter',
        status: 'active',
        settings: {},
      },
    });
    orgIds[org.slug] = row.id;

    // properties is FORCE RLS — set the org's context for the WITH CHECK.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${row.id}'`);
      await tx.property.upsert({
        where: { tenantId_slug: { tenantId: row.id, slug: 'primary' } },
        update: { name: org.name },
        create: { tenantId: row.id, slug: 'primary', name: org.name, isPrimary: true },
      });
    });
  }

  // ── The partner capability row + the referral/commission/payout ledgers, all
  //    under the partner org's own FORCE-RLS context.
  const partnerId = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    const profile = {
      tier: 'certified',
      status: 'active',
      displayName: 'WizeWorks Studio',
      bio: 'A full-service sparx partner — we design, build and run content-and-commerce sites for growing businesses, then stay on as their team.',
      websiteUrl: 'https://wizeworks.example',
      kind: 'agency',
      locationCity: 'Portland',
      locationState: 'OR',
      locationCountry: 'US',
      isRemote: true,
      specialties: ['ecommerce', 'b2b', 'design', 'seo'],
      directoryVisible: true,
      stripePayoutAccountId: 'acct_seeddemo_wizeworks',
      payoutMinCents: 5000,
      appliedAt: daysAgo(120),
      approvedAt: daysAgo(110),
      certifiedAt: daysAgo(40),
    };

    const partner = await tx.partner.upsert({
      where: { tenantId },
      update: profile,
      // `slug` is on the create side only — it is the partner's permanent public
      // URL (sparx.works/partners/wizeworks-studio) and a re-seed must not move
      // it, exactly as a rename in the app does not.
      create: { tenantId, referralCode: 'WIZEWORKS', slug: 'wizeworks-studio', ...profile },
    });

    // Rebuild the ledgers deterministically. Commissions first (they reference the
    // payout run + referral rows via SetNull), then runs, then referrals.
    await tx.partnerCommission.deleteMany({ where: { tenantId } });
    await tx.partnerPayoutRun.deleteMany({ where: { tenantId } });
    await tx.partnerReferral.deleteMany({ where: { tenantId } });

    const referral = (data: {
      slug: string;
      signupDaysAgo: number;
      firstPaymentDaysAgo: number | null;
      commissionRate: number;
      commissionType: 'one_time' | 'ongoing';
      status: 'pending' | 'active' | 'churned' | 'forfeited';
    }) => {
      const referredTenantId = orgIds[data.slug];
      if (!referredTenantId) throw new Error(`client org not seeded: ${data.slug}`);
      return tx.partnerReferral.create({
        data: {
          tenantId,
          partnerId: partner.id,
          referredTenantId,
          referralCode: 'WIZEWORKS',
          signupAt: daysAgo(data.signupDaysAgo),
          firstPaymentAt:
            data.firstPaymentDaysAgo == null ? null : daysAgo(data.firstPaymentDaysAgo),
          commissionRate: data.commissionRate,
          commissionType: data.commissionType,
          status: data.status,
        },
      });
    };

    const ridgeline = await referral({
      slug: 'ridgeline-outfitters',
      signupDaysAgo: 95,
      firstPaymentDaysAgo: 88,
      commissionRate: 0.05, // certified ongoing = 5% on managed accounts (§B.4)
      commissionType: 'ongoing',
      status: 'active',
    });
    const copperleaf = await referral({
      slug: 'copperleaf-studio',
      signupDaysAgo: 82,
      firstPaymentDaysAgo: 80,
      commissionRate: 0.3, // first-payment share (§B.4)
      commissionType: 'one_time',
      status: 'active',
    });
    // Signed up under the link but hasn't paid yet — the pending referral state.
    await referral({
      slug: 'harbor-and-main-coffee',
      signupDaysAgo: 9,
      firstPaymentDaysAgo: null,
      commissionRate: 0.3,
      commissionType: 'one_time',
      status: 'pending',
    });

    // One settled payout run (May) that disbursed the two paid commissions below.
    const paidCents = 4200 + 8900;
    const payoutRun = await tx.partnerPayoutRun.create({
      data: {
        tenantId,
        partnerId: partner.id,
        periodStart: new Date('2026-05-01T00:00:00.000Z'),
        periodEnd: new Date('2026-05-31T23:59:59.999Z'),
        amountCents: paidCents,
        currency: 'USD',
        commissionCount: 2,
        status: 'paid',
        stripeTransferId: 'tr_seeddemo_2026_05',
        paidAt: daysAgo(50),
      },
    });

    await tx.partnerCommission.createMany({
      data: [
        // Paid — Copperleaf's first-payment share, disbursed in the May run.
        {
          tenantId,
          partnerId: partner.id,
          referralId: copperleaf.id,
          amountCents: 8900,
          createdAt: daysAgo(80),
          currency: 'USD',
          period: null,
          kind: 'one_time',
          status: 'paid',
          payoutRunId: payoutRun.id,
          stripeTransferId: 'tr_seeddemo_2026_05',
          paidAt: daysAgo(50),
        },
        // Paid — Ridgeline's May recurring share, same run.
        {
          tenantId,
          partnerId: partner.id,
          referralId: ridgeline.id,
          amountCents: 4200,
          createdAt: daysAgo(51),
          currency: 'USD',
          period: '2026-05',
          kind: 'ongoing',
          status: 'paid',
          payoutRunId: payoutRun.id,
          stripeTransferId: 'tr_seeddemo_2026_05',
          paidAt: daysAgo(50),
        },
        // Approved — June recurring, awaiting the next payout run.
        {
          tenantId,
          partnerId: partner.id,
          referralId: ridgeline.id,
          amountCents: 4500,
          createdAt: daysAgo(21),
          currency: 'USD',
          period: '2026-06',
          kind: 'ongoing',
          status: 'approved',
        },
        // Pending — July recurring, not yet approved.
        {
          tenantId,
          partnerId: partner.id,
          referralId: ridgeline.id,
          amountCents: 4800,
          createdAt: daysAgo(6),
          currency: 'USD',
          period: '2026-07',
          kind: 'ongoing',
          status: 'pending',
        },
      ],
    });

    console.log(`Seeded partner "${partner.displayName}" (${partner.tier}) for tenant ${tenantId}`);
    return partner.id;
  });

  // ── Consultant access — the owner operates two of the client orgs. Copperleaf is
  //    both referred AND managed (two badges); Junegrass is managed-only (access,
  //    no referral). members is auth-layer RLS — write under each org's context.
  const owner = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return tx.user.findFirst({ where: { tenantId, role: 'owner' } });
  });

  if (owner) {
    const ownerId = owner.id;
    for (const slug of ['copperleaf-studio', 'junegrass-botanicals'] as const) {
      const orgId = orgIds[slug];
      if (!orgId) continue;
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${orgId}'`);
        await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${ownerId}'`);
        await tx.member.upsert({
          where: { organizationId_userId: { organizationId: orgId, userId: ownerId } },
          update: { memberType: 'consultant', status: 'active', role: 'admin' },
          create: {
            organizationId: orgId,
            userId: ownerId,
            role: 'admin',
            memberType: 'consultant',
            status: 'active',
          },
        });
      });
    }
  }

  // ── Bootcamps — one published (valid only because the host is Certified) and one
  //    draft, so the list shows both states and the edit/publish flow is testable.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    await tx.bootcamp.upsert({
      where: { slug: 'launch-your-store-in-a-weekend' },
      update: { status: 'published', publishedAt: daysAgo(5), partnerId },
      create: {
        tenantId,
        partnerId,
        title: 'Launch Your Store in a Weekend',
        slug: 'launch-your-store-in-a-weekend',
        description:
          '<p>A hands-on two-day cohort: leave with a live sparx site, a stocked catalog and your first checkout tested — no code, no jargon.</p>',
        format: 'virtual',
        locationCountry: 'US',
        startsAt: daysAhead(21),
        endsAt: daysAhead(22),
        seatsTotal: 40,
        seatsFilled: 12,
        priceCents: 19900,
        currency: 'USD',
        registrationMode: 'internal',
        status: 'published',
        publishedAt: daysAgo(5),
      },
    });

    await tx.bootcamp.upsert({
      where: { slug: 'b2b-wholesale-foundations' },
      update: { partnerId },
      create: {
        tenantId,
        partnerId,
        title: 'B2B Wholesale Foundations',
        slug: 'b2b-wholesale-foundations',
        description:
          '<p>For agencies taking a client wholesale: price lists, net terms, approvals and the buyer portal, start to finish.</p>',
        format: 'hybrid',
        locationCity: 'Portland',
        locationState: 'OR',
        locationCountry: 'US',
        startsAt: daysAhead(45),
        endsAt: daysAhead(46),
        seatsTotal: 25,
        seatsFilled: 0,
        priceCents: 24900,
        currency: 'USD',
        registrationMode: 'internal',
        status: 'draft',
      },
    });

    console.log(`Seeded partner bootcamps for tenant ${tenantId}`);
  });
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
