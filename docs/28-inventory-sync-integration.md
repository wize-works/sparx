# Sparx Platform — Third-Party Inventory Sync

**Version:** 0.1 (design notes — not yet scheduled)
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

> **Status: backlog / thinking doc.** This captures the problem and a proposed shape so it isn't forgotten. Nothing here is built. This is a **generic** inventory-sync framework: an external system of record (ERP / WMS / inventory app) owns stock, and Sparx mirrors it. The first concrete driver is **Gillett Diesel Service**, whose parts inventory lives in **Fishbowl** on-premise — but Fishbowl is one _adapter_ among many (NetSuite, QuickBooks Commerce, Cin7/DEAR, Katana, Finale, SOS, Acumatica, plain CSV…). Design for the abstraction; validate it against a real instance of whichever system the first merchant runs before committing to an adapter's details.

---

## 1. The problem

Today Sparx treats inventory as a number we own. [`product_variants.inventory_quantity`](05-data-model.md) is a single `INTEGER` that the Commerce engine decrements atomically on checkout ([09-ecommerce-engine-prd.md](09-ecommerce-engine-prd.md) §Inventory). The platform is the source of truth.

For any merchant who already runs an ERP or dedicated inventory system, that assumption is wrong. **Their system is the source of truth**, not us. That's where receiving, purchase orders, physical counts, manufacturing/work orders, and often their own POS sales happen. The Sparx storefront is downstream — it needs to _reflect_ the external on-hand quantities and _report_ sales back so the external system depletes stock and triggers reorders. If the two drift, the merchant either oversells what they don't have or hides what they could sell.

This is not "import a CSV once." It is **continuous, bidirectional reconciliation** between an external system of record and our catalog, per tenant — and the external system is frequently one we can't reach directly (it lives behind the merchant's firewall).

It forces three changes to how we currently think about inventory:

1. **A variant can have an external owner.** Some SKUs are Sparx-managed (we own the count); some are externally-managed (the ERP owns the count, we mirror it). They coexist in one catalog.
2. **Inventory needs a location dimension.** Real inventory systems are multi-location (warehouses, bins, stores). Even a merchant who only sells from one location online needs the model to say "on-hand at location X" rather than a single global integer, because the next merchant will have several.
3. **Writes become asynchronous and authoritative-elsewhere.** When we sell, decrementing our mirror is optimistic; the real depletion is an event we push to the external system, which may reject or adjust it.

---

## 2. Where this fits in the architecture

This is a **connector framework**, conceptually the sibling of the dropship supplier connectors ([14-dropship-integration-prd.md](14-dropship-integration-prd.md) §3) and the channel integrations ([27-tiktok-shop-integration.md](27-tiktok-shop-integration.md)). The difference: dropship/channel connectors are about _catalog + orders_ against public SaaS APIs; this is primarily about _stock levels_, and the external system is often **inside the merchant's network** rather than on the internet.

It belongs to the **Commerce module** — no separate module fee. It is event-driven like everything else (the platform-wide rule: side effects flow through Pub/Sub, never inline in request handlers — see [CLAUDE.md](../CLAUDE.md)). Inbound stock changes and outbound sales are both events.

The key design principle is a **thin source-agnostic core + per-system adapters**:

- The **core** (tables, sync worker, conflict rules, dashboard) knows nothing about Fishbowl or NetSuite. It speaks one normalized vocabulary: SKU, location, on-hand, delta, snapshot, sale.
- An **adapter** is the only Fishbowl-aware (or NetSuite-aware, etc.) code. It translates the external system's API/export into the normalized events and writes normalized sales back. Adding a new inventory system = writing one adapter, not touching the core.

```
  External system of record                    Sparx (GKE / Cloud Run)
  ┌────────────────────────────┐
  │ ERP / WMS / inventory app  │
  │  Fishbowl │ NetSuite │ …   │
  └──────────────┬─────────────┘
                 │ (connectivity varies — see §3)
                 ▼
       ┌───────────────────┐   inventory.external.updated   ┌──────────────────┐
       │  source adapter   │ ─────────────────────────────▶ │  Pub/Sub topic   │
       │ (per-system code) │ ◀───────────────────────────── │                  │
       └───────────────────┘   inventory.sale.recorded      └────────┬─────────┘
            normalized events                                         │
                                                          ┌───────────▼───────────┐
                                                          │ inventory-sync-worker │  ← source-agnostic
                                                          │  - upsert mirror rows │
                                                          │  - resolve conflicts  │
                                                          │  - reconcile snapshots│
                                                          └───────────┬───────────┘
                                                                      ▼
                                                          product_variants / stock_levels
```

The worker is a Pub/Sub consumer — defaults to the **cloud-run-worker** module pattern, same as email-worker/media-worker, not a GKE Deployment.

---

## 3. The hard part: connectivity tiers

External inventory systems fall into a spectrum of reachability, and the adapter's transport is chosen per system (and sometimes per merchant). This is the constraint that shapes the most work, so it gets its own taxonomy:

**Tier A — On-prem, LAN-only (hardest).** Classic desktop/server ERPs whose API is only spoken on the merchant's local network, with no public endpoint and no inbound access from our cloud. **Fishbowl Inventory** (Windows app, local SQL Server/Firebird backend, LAN API) is the archetype. The integration must be **outbound from their side**: a small **Sparx Inventory Bridge** agent the merchant installs on a machine on their network. It talks to the ERP locally and to Sparx over **outbound HTTPS only** — long-poll/pull a command queue, push stock snapshots and deltas. We control it end-to-end but must build, sign, ship, support a (usually Windows) agent plus a pairing/enrollment flow that mints a tenant-scoped API key. This is the most robust path and the one to assume for serious on-prem ERPs.

**Tier B — Hosted / cloud API (easiest).** SaaS inventory systems (NetSuite, QuickBooks Commerce, Cin7/DEAR, Katana, Finale, Fishbowl Drive/Advanced's hosted REST tier…) expose a public REST API. The adapter connects like any other SaaS connector — OAuth or API key, outbound from us, no agent. Far less to build. Only promise the no-agent path once the merchant is confirmed to be on a reachable tier.

**Tier C — File drop / iPaaS / CSV (fallback).** Systems with no usable API, or merchants who won't install an agent and aren't hosted. They export flat files (or route through middleware they already own); we ingest via the bulk path. Lower fidelity — batch, not near-real-time — but it's the universal escape hatch, mirroring the dropship CSV tier.

**The data model in §4 is identical across all three tiers** — only the adapter's transport differs. When we pick a merchant up, the first question is which tier their system supports; don't design an adapter in detail until we've put hands on the actual instance and know its version, API surface, and whether their IT will allow an on-prem agent.

---

## 4. Data model sketch

Minimal additions. Keep `product_variants` as the catalog spine; move the _quantity_ out to a location-aware table and add a _source mapping_ table. Nothing here is system-specific.

```sql
-- Where stock physically lives. Maps to an external location/warehouse/bin.
CREATE TABLE stock_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(255) NOT NULL,
  external_ref    VARCHAR(255),          -- external location id, nullable for Sparx-native
  is_sellable     BOOLEAN NOT NULL DEFAULT true,   -- does online stock draw from here?
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

-- Per-variant, per-location quantity. The source of truth for externally-managed
-- variants; replaces the single inventory_quantity for them.
CREATE TABLE stock_levels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  variant_id        UUID NOT NULL REFERENCES product_variants(id),
  location_id       UUID NOT NULL REFERENCES stock_locations(id),
  on_hand           INTEGER NOT NULL DEFAULT 0,   -- physical, mirrored from external system
  committed         INTEGER NOT NULL DEFAULT 0,   -- reserved by open orders
  available         INTEGER GENERATED ALWAYS AS (on_hand - committed) STORED,
  source_synced_at  TIMESTAMPTZ,                  -- last time the source confirmed this number
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, variant_id, location_id)
);

-- Ties a Sparx variant to its identity in the external system.
CREATE TABLE inventory_source_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  variant_id       UUID NOT NULL REFERENCES product_variants(id),
  source           VARCHAR(50) NOT NULL,          -- adapter key: 'fishbowl' | 'netsuite' | 'csv' | …
  external_sku     VARCHAR(255) NOT NULL,         -- external part/SKU number
  external_uom     VARCHAR(50),                   -- unit-of-measure (not always 1:1 with online "each")
  sync_mode        VARCHAR(20) NOT NULL DEFAULT 'mirror', -- mirror | two_way | manual
  last_seen_at     TIMESTAMPTZ,
  UNIQUE(tenant_id, source, external_sku)
);

-- One configured connection per tenant per external system (credentials, options, health).
CREATE TABLE inventory_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  source           VARCHAR(50) NOT NULL,          -- adapter key
  connectivity     VARCHAR(20) NOT NULL,          -- agent | cloud | file  (Tier A/B/C)
  config           JSONB NOT NULL DEFAULT '{}',   -- adapter-specific (endpoint, location filter, buffer…)
  status           VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | online | offline | error
  last_delta_at    TIMESTAMPTZ,
  last_reconcile_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, source)
);
```

All tables are tenant-scoped, so they carry RLS the same way every other tenant table does: `ENABLE` + `FORCE` row-level security with a `tenant_isolation` policy on `current_tenant_id()`, hand-written into the migration SQL (Prisma doesn't generate it — see the RLS pattern in [packages/db/README.md](../packages/db/README.md) and CLAUDE.md).

`product_variants.inventory_quantity` stays as the fast-read denormalized "total available across sellable locations" for Sparx-native SKUs and the storefront's existing availability checks; for externally-linked variants it becomes a derived rollup of `stock_levels`. (Alternatively, deprecate it and always sum `stock_levels` — decide on read-path cost. For now, keep it and treat it as a cache.)

A variant with **no** row in `inventory_source_links` is fully Sparx-managed and behaves exactly as today. That's what keeps the change non-breaking.

---

## 5. Sync flows

All normalized — adapters emit/consume these regardless of the external system.

### 5.1 Inbound — external system → Sparx (the common case)

Two mechanisms, both needed:

- **Delta events.** When stock changes in the external system (receipt, adjustment, their own POS sale, work-order consumption), the adapter emits `inventory.external.updated` with `{ source, external_sku, location, on_hand }`. The sync worker resolves the SKU via `inventory_source_links`, upserts `stock_levels`, recomputes `available`, and publishes `inventory.changed` so the storefront / search index / `inventory.low` consumers update. Near-real-time path.
- **Periodic full snapshot (reconciliation).** Deltas drift — a missed event, a manual edit, an agent restart, a file gap. So on a schedule (nightly, plus on-demand), the adapter pulls a **full SKU/on-hand list** and the worker reconciles: anything that disagrees with our mirror gets corrected to the external value, and the discrepancy is logged. **The external system always wins on `on_hand`.** Reconciliation is the safety net that makes the lossy delta path tolerable.

### 5.2 Outbound — Sparx → external system (sales)

When a Sparx order is paid/fulfilled, line items that map to externally-managed SKUs produce an `inventory.sale.recorded` event. The adapter writes the depletion into the external system (a sale/ship transaction in _its_ terms) so its on-hand drops and reorder logic fires. This is `sync_mode = two_way`.

This write is **advisory from Sparx's perspective** — the external system is authoritative. We record that we asked; the next inbound snapshot confirms the real resulting quantity. We do **not** assume our decrement and theirs are equal (UoM conversions, kits/BOMs, their own concurrent activity).

### 5.3 Overselling and reservations

The storefront sells against `available` (`on_hand − committed`). Risk is the window between a physical change at the merchant and the next delta reaching us. Mitigations, configurable per tenant/source:

- A **safety buffer** per location/variant (don't expose the last N units online).
- `inventory_policy = deny` for externally-linked variants by default (no backorders on stock we can't guarantee).
- Treat `committed` as a true reservation at add-to-cart/checkout, released on abandonment — so two online shoppers can't both claim the last unit before the external round-trip resolves.

---

## 6. Conflict resolution rules (write these down before coding)

| Situation                                                   | Rule                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Inbound on-hand disagrees with mirror                       | **External system wins.** Overwrite, log the delta.                                          |
| We sold a unit; external snapshot hasn't caught up          | Keep our `committed`; reconcile `on_hand` to the source, recompute `available`.              |
| SKU exists in external system, not in Sparx catalog         | Don't auto-create products. Surface in an "unmapped external SKUs" review queue.             |
| SKU exists in Sparx, link points to a missing external part | Mark variant stale, stop selling it (or fall back to manual), alert the merchant.            |
| UoM mismatch (external "case of 12" vs storefront "each")   | Conversion factor on `inventory_source_links.external_uom` + a multiplier; never assume 1:1. |
| Two delta events out of order                               | Last-writer-by-`source_synced_at`, not by arrival time. Stamp events at the source.          |
| Two sources both claim the same variant                     | Disallow — `inventory_source_links` is one source per variant; enforce in mapping UI.        |

---

## 7. Merchant-facing surface (dashboard)

- A **Connections → Inventory Source** screen: pick the system, connect it (download/pair the bridge agent for Tier A, enter API credentials for Tier B, configure file ingest for Tier C), choose which external location(s) feed the online store, set the safety buffer.
- A **SKU mapping** view: auto-match by SKU/part number, manual-map the rest, flag unmapped on both sides.
- A **sync health** panel: last delta received, last full reconcile, mismatches corrected, source online/offline status (a Tier-A agent _will_ go offline — surface it loudly rather than silently serving stale stock).

---

## 8. Open questions

- For the first merchant (Gillett / Fishbowl): exact version/edition, connectivity tier, and whether their IT will allow an on-prem agent (§3). **Everything downstream depends on this — answer it per merchant before building their adapter.**
- **Kits / assemblies** sold online whose components deplete separately in the external system → needs BOM-aware depletion, materially more work. Common in shops that manufacture or bundle.
- **Manufacturing / work orders:** does online availability need to subtract stock committed to open work orders inside the external system? (Likely yes for shops like Gillett.)
- Is one-directional **mirror** enough for v1 (we show their stock; they keep depleting via their own processes) so we can defer the outbound sale-write? That would dramatically cut scope for a first cut — worth proposing per merchant.
- Adapter SDK shape: define the normalized interface (`pullSnapshot()`, `streamDeltas()`, `pushSale()`, `health()`) once so a new system is a self-contained adapter package, never a core change.

---

## 9. Rough phasing (when scheduled)

1. **Core + read-only mirror.** Add the tables, build the source-agnostic worker, and ingest a full snapshot via the simplest transport available for the first merchant (even a manual export), showing real on-hand on the storefront. No writes back. Proves the data model, the adapter interface, and the SKU-mapping UX with the least risk.
2. **Live inbound deltas + reconciliation.** Stand up the first adapter (bridge agent or cloud API), near-real-time updates, nightly reconcile, sync-health UI.
3. **Outbound sales write (`two_way`).** Close the loop so Sparx sales deplete the external system.
4. **Second adapter.** Onboard a different inventory system to prove the abstraction holds; refactor anything that leaked system-specifics into the core.

Ship phase 1 to the first merchant the moment it's useful — read-only accurate stock is already a win — rather than waiting for the full bidirectional loop.
