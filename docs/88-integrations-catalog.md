# Integrations — taxonomy, shapes & build catalog

**Version:** 0.1.1
**Author:** Brandon Korous
**Last Updated:** 2026-06-17

---

## 1. Purpose & relationship to other docs

"Integration" is one of the four marketplace categories ([docs/60](60-marketplace.md)), but the word is
**overloaded**: a payment provider, a TikTok sales channel, an ERP inventory mirror, a Zapier
connector, and an `ext.*` data binding are all called "integrations" and they are **architecturally
different things** — different install flows, different runtime contracts, different trust postures.
Today that breakdown is scattered across eight point-docs with no front door, and the catalog
vocabulary already disagrees with the code (§4).

This doc is the **hub**. It does three jobs:

1. Defines the **taxonomy** — the _purpose_ axis (what business job an integration does) and the
   _shape_ axis (the technical contract, which determines which subsystem owns it). The shape axis is
   the real architectural decision; the marketplace `kind` string is just the purpose facet.
2. **Indexes** every existing integration doc into that taxonomy, with build status (§5), so this is
   the single place to see what exists, what's half-built, and what's missing.
3. Specs the **workflow-connector contract** (§7) — how an automation action invokes an integration
   as an outbound effector — which is the piece the Automation module ([docs/81](81-automation-module.md))
   needs next.

It does **not** replace the per-integration docs; it points at them. Each subsystem keeps its own
spec:

- Provider runtime + install flow → `@wizeworks/integration-framework` + the marketplace install flow
  ([docs/60](60-marketplace.md) §6, §10).
- Dropship suppliers → [docs/14](14-dropship-integration-prd.md).
- Domain registrar → [docs/24](archive/24-domain-purchase-management.md).
- TikTok Shop → [docs/27](27-tiktok-shop-integration.md). Social channels → [docs/71](71-social-commerce-channels.md).
- ERP/WMS inventory sync → [docs/28](28-inventory-sync-integration.md).
- External data connections (`ext.*`) → [docs/63](63-external-data-connections.md).
- Business formation → [docs/74](74-business-formation-integration.md).
- Automation engine + Zapier/Make/n8n + inbound webhooks → [docs/81](81-automation-module.md) §10.
- Event bus / inbound trigger fan-in → [docs/82](82-event-bus-unification.md).
- Third-party integration submission + the deferred code sandbox → [docs/85](85-creator-marketplace.md).

---

## 2. The two axes

An integration is described by **two orthogonal axes**. Keeping them separate is the whole point —
the marketplace currently collapses both into one `kind` string, which is why accounting/marketing
"kinds" exist in the facet list ([docs/60](60-marketplace.md) §8) but not in the runtime enum (§4).

- **Purpose** — _what business job it does._ Payments, tax, shipping, accounting, marketing, sales
  channel, inventory sync, … This is the **marketplace facet** a tenant browses by. Open-ended; new
  purposes are data.
- **Shape** — _the technical contract._ How it installs, what it executes, who owns the runtime, and
  what can go wrong. This is a **closed set** (§3). The shape determines the acquire action ("Connect"
  vs "Add channel" vs "Authorize") and which subsystem the listing routes to.

> **Design rule.** A marketplace `MarketplaceIntegration` row carries **both**: `purpose` (the facet,
> a loose string — already `z.string()` in [listing.ts](../packages/marketplace-schemas/src/listing.ts))
> and `shape` (a discriminator from §3). The current schema only models provider-adapter integrations;
> §8 phases in the `shape` discriminator so a non-provider listing (a channel, a connector) gets the
> right install flow instead of being force-fit into "Connect → provider install".

---

## 3. The shape axis (closed set)

Eight shapes. Each has a distinct runtime owner, lifecycle, and trust posture. **Do not invent a
ninth without adding it here** — that's the same discipline as the module manifest.

| #   | Shape                         | What it is                                                                                   | Runtime owner                                                          | Acquire action           | Direction                 | Trust edge                                   |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------ | ------------------------- | -------------------------------------------- |
| 1   | **Provider adapter**          | Install + config + secrets + webhooks; executes per-transaction logic on the tenant's behalf | `@wizeworks/integration-framework` `ProviderBundle` + `provider-*` pkg | **Connect**              | outbound, request-time    | partner adapter runs code → review + sandbox |
| 2   | **Sales channel**             | Two-way catalog/order sync to an external selling surface                                    | channel-sync worker (per channel)                                      | **Add channel**          | bidirectional, continuous | OAuth scopes to a marketplace account        |
| 3   | **Sync source**               | Mirror of an external system of record (ERP/WMS/ledger)                                      | sync bridge + reconciliation                                           | **Connect source**       | inbound-primary, batched  | on-prem bridge / credentials                 |
| 4   | **Connector (action target)** | Outbound effector an automation action or webhook invokes                                    | automation action executor (gated)                                     | **Authorize**            | outbound, event-time      | external side effect → gate layer            |
| 5   | **Data source**               | Read-only binding into the builder (`ext.*` REST/GraphQL/SQL)                                | hardened SSRF proxy + render path                                      | **Bind**                 | inbound, render-time      | SSRF; untrusted upstream                     |
| 6   | **Inbound trigger**           | External system calls _into_ sparx (webhook / channel push) → fires an automation            | event bus + `automation.trigger` fan-in                                | **Generate URL**         | inbound                   | shared-secret auth on the endpoint           |
| 7   | **Identity provider**         | SSO/OIDC for platform or site auth                                                           | Better Auth (platform) / `@wizeworks/customer-auth` (site)             | **Enable SSO**           | inbound, login-time       | token/secret handling                        |
| 8   | **Registrar**                 | Domain purchase, DNS, transfer                                                               | domain service                                                         | **Buy / Connect domain** | outbound, lifecycle       | money movement; DNS authority                |

**The key reframe:** shapes 1–3 are commerce-flavored and mostly exist; shapes 4–6 are what the
**Automation module** needs and are mostly undocumented as a contract; shapes 7–8 are platform
plumbing that already half-exists. The marketplace today only knows shape 1.

---

## 4. Reconciling code vs. catalog (the existing drift)

There are two vocabularies in the repo and they don't match:

- **`ProviderKind`** ([commerce-schemas/providers.ts](../packages/commerce-schemas/src/providers.ts)):
  `payment · tax · shipping · subscription_billing · dropship · identity(future)`. This is **not the
  integration taxonomy** — it is the **sub-type vocabulary of shape #1 (provider adapter) only**. A
  single `ProviderBundle` may implement several at once (Stripe = payment + subscription_billing +
  tax), which is correct and stays.
- **Marketplace facets** ([docs/60](60-marketplace.md) §8): `payments · shipping · tax · accounting ·
marketing`. Two of these — **`accounting` and `marketing`** — have **no runtime representation**.
  They are phantom facets: the catalog advertises a filter the platform can't fulfil.

**Resolution (decided here):**

1. `integration.purpose` (marketplace facet) is the **superset**; `ProviderKind` remains the
   **closed sub-vocabulary of the provider-adapter shape**. Do **not** grow `ProviderKind` to hold
   `accounting`/`marketing`/`channel` — those are different _shapes_, not more provider kinds.
2. `accounting` resolves to **shape #3 (sync source)** — QuickBooks/Xero are ledger mirrors, not
   request-time adapters. `marketing` resolves to **shape #4 (connector)** and/or **shape #2
   (channel)** depending on the integration (Klaviyo = connector; Meta Shopping = channel).
3. Until those land, keep `accounting`/`marketing` as **`coming-soon` purposes** ([docs/60](60-marketplace.md)
   §M7) with no live facet count — not as live filters that return zero.

---

## 5. The integration index (every existing doc, mapped)

Status legend: ✅ built & registered · 🟡 package/spec exists, not activated · 📄 documented, not
built · ⬜ not started.

| Purpose              | Named integration                                     | Shape                   | Doc                                                                   | Status                                                |
| -------------------- | ----------------------------------------------------- | ----------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| Payments             | **Stripe**                                            | 1 provider              | [60](60-marketplace.md)                                               | ✅ registered (payment+subs+tax)                      |
| Payments             | PayPal                                                | 1 provider              | [60](60-marketplace.md)                                               | 🟡 `provider-paypal` exists, **not bootstrapped**     |
| Tax                  | Stripe Tax                                            | 1 provider              | [60](60-marketplace.md)                                               | ✅ via Stripe bundle                                  |
| Tax                  | TaxJar                                                | 1 provider              | [60](60-marketplace.md)                                               | 🟡 `provider-taxjar`, not bootstrapped                |
| Tax                  | Avalara                                               | 1 provider              | [60](60-marketplace.md)                                               | 🟡 `provider-avalara`, not bootstrapped               |
| Shipping             | **Shippo**                                            | 1 provider              | [60](60-marketplace.md)                                               | ✅ registered                                         |
| Shipping             | EasyPost                                              | 1 provider              | [60](60-marketplace.md)                                               | 🟡 `provider-easypost`, not bootstrapped              |
| Subscription billing | Stripe Billing                                        | 1 provider              | [17](17-billing-subscriptions.md)                                     | ✅ via Stripe bundle                                  |
| Dropship             | Generic supplier connector                            | 1 provider              | [14](14-dropship-integration-prd.md)                                  | 📄 framework speced (`DropshipProvider` iface exists) |
| Sales channel        | TikTok Shop                                           | 2 channel               | [27](27-tiktok-shop-integration.md)                                   | 📄                                                    |
| Sales channel        | Social commerce (Meta/IG, Pinterest, Google Shopping) | 2 channel               | [71](71-social-commerce-channels.md)                                  | 📄                                                    |
| Inventory sync       | ERP/WMS mirror (generic + on-prem bridge)             | 3 sync                  | [28](28-inventory-sync-integration.md)                                | 📄                                                    |
| Accounting           | QuickBooks / Xero                                     | 3 sync                  | —                                                                     | ⬜ (phantom facet, §4)                                |
| Marketing            | Klaviyo / Mailchimp / SMS                             | 4 connector / 2 channel | —                                                                     | ⬜ (phantom facet, §4)                                |
| Workflow connector   | Zapier · Make.com · n8n                               | 4 connector             | [81](81-automation-module.md) §10                                     | 📄 Phase 5                                            |
| Workflow trigger     | Inbound webhook → `webhook.received`                  | 6 inbound               | [81](81-automation-module.md) §10 / [82](82-event-bus-unification.md) | 📄                                                    |
| Data source          | `ext.*` REST/GraphQL/SQL                              | 5 data                  | [63](63-external-data-connections.md)                                 | 📄 capstone, deferred                                 |
| Identity             | Social SSO                                            | 7 identity              | [16](16-auth-security.md)                                             | ⬜ (`identity` reserved in `ProviderKind`)            |
| Registrar            | GoDaddy reseller                                      | 8 registrar             | [24](archive/24-domain-purchase-management.md)                        | ✅ partial (lookup unwired in onboarding)             |
| Email infra          | Mailgun                                               | (platform)              | [13](13-email-platform-prd.md)                                        | ✅                                                    |
| Business formation   | (formation API)                                       | 4 connector             | [74](74-business-formation-integration.md)                            | 📄                                                    |

Reality check on what _actually_ works end-to-end: **only Stripe + Shippo register at boot**
([providers-bootstrap.ts](../services/api-rest/src/lib/providers-bootstrap.ts)). The other four
provider packages are written but never registered, so their marketplace "Connect" CTA can't
complete — the cheapest, highest-value fix on this whole list (§8 P0).

---

## 6. Anatomy of a provider adapter (shape #1, the built path)

The one shape that is real today, captured so new providers follow it without re-reading the
framework:

- A **provider package** (`@sparx/provider-<slug>`) exports a `ProviderBundle`
  ([registry.ts](../packages/integration-framework/src/registry.ts)): a `metadata` descriptor plus the
  per-kind entry points it implements (`payment` / `tax` / `shipping` / `subscriptionBilling` /
  `dropship`). One package, many kinds.
- **Metadata** ([metadata.ts](../packages/integration-framework/src/metadata.ts)) carries the install
  card: `slug`, `displayName`, `vendor`, `kinds[]`, supported currencies/countries, a stringified
  **JSON Schema** for the config form, a `webhookPathTemplate`, and `requiredScopes[]`. `whitelabelOf`
  flags a sparx-branded wrapper ("powered by Stripe").
- **Registration** happens in [providers-bootstrap.ts](../services/api-rest/src/lib/providers-bootstrap.ts)
  (idempotent; "already registered" is swallowed for HMR/test). **A new provider is not live until it
  is added here** — the marketplace seed row alone does nothing.
- **Secrets** never touch the row: config secrets resolve through the `SecretReader` (`env:` in dev,
  Google Secret Manager `projects/…` in prod).
- **Webhooks** route through the framework's `webhook-router`; the install's `webhookPathTemplate`
  tells the tenant what URL to register if the provider can't self-register via OAuth.
- **Install state** (`ProviderInstallation`) is the per-tenant overlay ([docs/60](60-marketplace.md)
  §6.4) — tenant-isolated, distinct from the cross-tenant catalog row.

---

## 7. The workflow-connector contract (shape #4 — what Automation needs next)

[docs/81](81-automation-module.md) §10 currently scopes external integration to \*\*Zapier / Make / n8n

- inbound webhooks**. That's the _escape-hatch_ tier. The richer, first-party tier is a **Connector**:
  a registered outbound effector that an automation **action\*\* invokes directly. This section is the
  contract; the build lands in docs/81 Phase 5.

A **Connector** is to an automation action what a `ProviderBundle` is to checkout:

- **Registration.** A connector registers a `ConnectorDescriptor`: `slug`, `displayName`, `vendor`,
  auth mode (`oauth` | `api_key` | `none`), `requiredScopes[]`, and an **`actions[]` manifest**.
- **Action manifest.** Each action = `{ id, label, paramsSchema (JSON Schema), requiredScopes[],
gateManifest }`. The params schema renders in the automation builder exactly like the provider
  config form renders in the install dialog — same JSON-Schema-driven form machinery.
- **Invocation.** `invoke(actionId, params, ctx)` where `ctx` carries the tenant, the resolved
  trigger entity, and the secret reader. The executor is a **thin call**, identical in posture to the
  internal action executor ([docs/81](81-automation-module.md) §5.4).
- **Gate layer is mandatory.** A connector action is _still an action_ — it routes through the global
  gate chain + per-action gate manifest ([docs/81](81-automation-module.md) §7.1). `GateResult` can
  `allow / deny / transform / defer`. An empty gate manifest must be **explicit**, never implicit.
  This is non-negotiable: an outbound side effect to an external service is exactly the class of
  action the gate layer exists to govern (rate, consent, dedupe, business hours).
- **Auth shares the provider plumbing.** OAuth/api-key install reuses the integration-framework
  `oauth` helper + `SecretReader` — a connector install is a row + secrets, same as a provider
  install, just consumed by the action executor instead of checkout.
- **Trust.** First-party connectors only at launch. Partner-published connectors are the **sharp
  edge** ([docs/60](60-marketplace.md) §11, [docs/85](85-creator-marketplace.md)) — gated behind
  sparx review + the deferred code sandbox, well beyond the first publishing phase.

The **inbound** half (shape #6) is already speced: a tenant's unique webhook URL POSTs in and fires
the net-new `webhook.received` trigger ([docs/81](81-automation-module.md) §10 / [docs/82](82-event-bus-unification.md)
§4). Connector (out) + inbound webhook (in) together are the complete external-workflow story; Zapier/
Make/n8n sit _on top_ of both as the universal long-tail bridge.

---

## 8. Build catalog (prioritized)

Priority is grounded in: **finish what already exists**, then **what the workflow engine being built
now needs**, then **fill the phantom facets**, then **growth/enterprise**. Gillett Diesel (B2B +
fleet + parts) shapes several P3 picks.

### P0 — finish the half-built (cheap, unblocks current surfaces)

- [ ] **Register the four dormant providers** — PayPal, EasyPost, TaxJar, Avalara into
      [providers-bootstrap.ts](../services/api-rest/src/lib/providers-bootstrap.ts). Packages exist; their
      marketplace "Connect" is broken until they boot. ([docs/60](60-marketplace.md) §15 phase-4 follow-up.)
- [ ] **Connector contract** (§7) — the `ConnectorDescriptor` + action manifest + gated executor.
      Prerequisite for everything a workflow does externally.
- [ ] **Inbound webhook trigger** — `webhook.received` endpoint + event (shape #6). The other half of §7.
- [ ] **Add the `shape` discriminator** to `MarketplaceIntegration` so non-provider listings route to
      the right acquire action (§2) instead of force-fitting "Connect".

### P1 — highest tenant value + fills phantom facets

- [ ] **QuickBooks Online** (shape #3 sync) — fills the `accounting` phantom facet; the #1 SMB ask.
      Xero as the fast-follow.
- [ ] **Slack connector** (shape #4) — ops alerts from automations. (docs/81 currently says "use
      Zapier for Slack"; a native first-party connector is worth reconsidering given how central Slack
      is to ops notifications — flagged as an open decision, §10.)
- [ ] **Generic outbound HTTP action** (shape #4) — the universal connector; any REST endpoint as an
      automation action, no per-vendor package. Pairs with the inbound webhook for a closed loop.
- [ ] **Official Zapier app** (shape #4, the long-tail bridge) — built over the REST API + durable
      outbound webhook engine ([docs/81](81-automation-module.md) §10).

### P2 — channels & growth

- [ ] **TikTok Shop** (shape #2 channel) — [docs/27](27-tiktok-shop-integration.md).
- [ ] **Social commerce feeds** (shape #2) — Meta/Instagram Shopping, Pinterest, Google Shopping —
      [docs/71](71-social-commerce-channels.md).
- [ ] **Make.com + n8n** connectors (shape #4) — same trigger/action set as Zapier.
- [ ] **Klaviyo / Mailchimp** (shape #4 connector) — fills the `marketing` phantom facet.

### P3 — enterprise / capstone

- [ ] **ERP/WMS inventory sync** (shape #3) — generic adapter + on-prem bridge; Gillett parts/fleet
      relevance — [docs/28](28-inventory-sync-integration.md).
- [ ] **`ext.*` external data connections** (shape #5) — the capstone — [docs/63](63-external-data-connections.md).
- [ ] **Amazon / eBay marketplaces** (shape #2 channel).
- [ ] **Social SSO** (shape #7) — `identity` is already reserved in `ProviderKind`.
- [ ] **Dropship named suppliers** (shape #1) on the [docs/14](14-dropship-integration-prd.md) framework.

---

## 9. Decisions (locked)

| #   | Decision                                        | Choice                                                                               | Why                                                                                                      |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| I1  | Two axes                                        | **`purpose` (facet, open) × `shape` (contract, closed set of 8)**                    | The overload is the root problem; separating them routes installs correctly.                             |
| I2  | `ProviderKind` scope                            | **Sub-vocabulary of shape #1 only — never the whole taxonomy**                       | Channels/connectors/data-sources are different shapes, not more provider kinds.                          |
| I3  | Phantom facets                                  | **`accounting`→sync, `marketing`→connector/channel; keep `coming-soon` until built** | Don't advertise a filter the runtime can't fulfil.                                                       |
| I4  | Connector = gated action                        | **Outbound connectors route through the docs/81 gate layer like any action**         | An external side effect is exactly what the gate governs.                                                |
| I5  | Connector auth                                  | **Reuse the integration-framework OAuth + SecretReader**                             | One secrets/install path for providers and connectors.                                                   |
| I6  | Partner integrations                            | **First-party only at launch; partner connectors/adapters behind review + sandbox**  | Executing partner code is the sharp edge ([60](60-marketplace.md) §11, [85](85-creator-marketplace.md)). |
| I7  | A new provider is "live" only when bootstrapped | **Seed row + registration both required**                                            | A catalog row without registration is a dead "Connect" button (current PayPal/TaxJar/etc.).              |

---

## 10. Open questions

- **Native Slack vs. Zapier-only.** [docs/81](81-automation-module.md) §10 routes Slack through
  Zapier. Given Slack's centrality to ops alerts, is a first-party Slack connector (P1) worth the
  maintenance over leaning on Zapier? (Leaning: yes, build native — it's the single most common
  notification target.)
- **Channel runtime owner.** Shape #2 (channels) has no home yet — one `channel-sync-worker` per
  channel, or a generic channel-sync framework mirroring the `ProviderBundle` pattern? Decide before
  TikTok (P2).
- **`shape` discriminator storage.** Add a column to `MarketplaceIntegration`, or derive shape from
  `purpose` via a registry map? (Leaning: explicit column — purposes can share a shape and we don't
  want a lookup table as the source of truth.)
- **Volume metering for connector runs.** External connector invocations are the most likely place
  unit economics bite ([docs/81](81-automation-module.md) §11) — same deferred metering question,
  flagged here so the connector executor logs invocation counts from day one.
