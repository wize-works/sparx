# Email Section Composer

**Version:** 1.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-30

---

## 1. Purpose & scope

The Email module ships a working **send pipeline** (`email.send` → `email-worker` → Mailgun) and a
management surface (templates, automations, broadcasts, domains, suppressions, analytics, settings
— [docs/13-email-platform-prd.md](13-email-platform-prd.md)). Authored email bodies are today a
single **rich-text region** (a CMS TipTap `CmsDoc` serialized to HTML). That was always the interim
([docs/13](13-email-platform-prd.md) P4; the original plan's P9 deferred the composer until the
shared section system existed).

This document is the **build contract** for replacing that single region with a **section
composer**: an email body becomes an ordered, reorderable list of typed **sections** — heading,
rich text, image, button, _featured products_, _latest blog posts_, _abandoned cart_, _recommended
for you_, etc. — each configured in a docked inspector beside a live, branded preview.

It is the **email-surface counterpart to the Site Builder redesign**
([docs/30-sitebuilder-redesign.md](30-sitebuilder-redesign.md)). It deliberately shares that doc's
UX language (structure rail · live canvas · docked inspector · drag-reorder · sample-item preview)
and its brand model (§6 of doc 30: brand is a tenant-level source of truth that consumers read and
never override). Where the Site Builder composes a **page** bound to a sample item, the Email
composer composes a **message** bound to a sample **recipient** — the same direct-manipulation tool,
a different render target.

**Non-goal:** this build does not edit `@sparx/sitebuilder-schemas` or the storefront renderer. Email
sections live in their own package (§8) to avoid colliding with the in-flight Site Builder
workstream, structured so a future shared "section kernel" absorbs both with no rework (§12).

---

## 2. North star

> An email is not a form with a text box. It is **a composition the merchant arranges in place** —
> seeing the real, branded result as they build, and seeing exactly which parts of it will differ
> for each person who receives it.

Three commitments:

1. **Direct manipulation.** Add sections from a categorized palette; reorder by drag; select a
   section in the canvas and edit it in a docked inspector beside the live result — never a modal
   over the preview.
2. **The data tier is visible.** Every section is one of three tiers — **Static**, **Dynamic**,
   **Personalized** — surfaced as palette grouping, an on-block badge, and a legend. The merchant
   learns _what varies per send_ by looking at the canvas (§4).
3. **Preview as a real recipient.** Pick a customer and the Personalized + Dynamic blocks fill with
   _their_ actual data, in the canvas, with no test send (§9.3). This is the capability a page
   builder cannot have, and it is the heart of the tool.

---

## 3. The workspace (full-bleed)

The composer is a **dedicated full-bleed route** — `/email/templates/[id]/design` for a template,
and the same shell for a broadcast (`/email/broadcasts/[id]/design`). It is **not** rendered inside
the standard `EmailShell` padded, max-width content container; a three-column canvas tool must fill
the workspace.

**Layout contract (hard requirements):**

- The designer route opts out of the normal email content shell and occupies the **full viewport
  height below the dashboard top nav**, edge to edge (no page gutter, no max-width clamp).
- It is a single CSS grid: `[ structure rail | live canvas | inspector ]` at roughly
  `300px · 1fr · 340px`, each column an **independent scroll region** (the page itself does not
  scroll; the columns do).
- A slim **status/action bar** spans the top of the workspace (template name · save state ·
  device + dark toggles · Preview-as-recipient picker · Send test · Save).
- Below the lg breakpoint the rail and inspector collapse into toggleable drawers; the canvas always
  wins the space. The composer is a desktop-first authoring surface (consistent with the Site
  Builder editor).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Weekly Hello   ● saved   [Preview as: Sarah Chen ▾]  [▭ desktop][▢][◐]  Test  Save │
├──────────────┬───────────────────────────────────────────┬───────────────┤
│  PALETTE     │              LIVE CANVAS                   │  INSPECTOR    │
│  Content     │   (branded email; click a block to        │  (selected    │
│  Commerce ·  │    select; hover between blocks for a      │   section's   │
│   dynamic    │    + insert point; drag handle to reorder) │   config +    │
│  Personalized│                                            │   data source │
│  Editorial · │                                            │   + spot-check│
│   dynamic    │                                            │   recipient)  │
└──────────────┴───────────────────────────────────────────┴───────────────┘
```

---

## 4. Section tiers — the crux

The single concept that distinguishes email composition from page composition. Every section
**definition** carries a `tier`:

| Tier             | Resolves                                        | Examples                                                          | Render cost            |
| ---------------- | ----------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| **static**       | Authored once; identical for every recipient    | heading, rich-text, image, button, divider, spacer                | rendered once          |
| **dynamic**      | Tenant-level data at **send build** time        | featured-products, collection-grid, latest-blog, active-promotion | resolved once per send |
| **personalized** | Bound to the **recipient** at **dispatch** time | abandoned-cart, recommended-for-you, recent-order, loyalty-points | resolved per recipient |

`tier` is not cosmetic — it **drives the render pipeline** (§7). A body with no `personalized`
section renders once and fans out (today's fast path, unchanged). A body with any `personalized`
section renders **per recipient**. The composer surfaces the tier so the merchant understands the
cost/behavior they are opting into, and so "preview as recipient" knows what to resolve.

This is the email analog of doc 30 §4.2's **static vs. bound** sections: a Personalized email
section is a "bound section" whose binding context is the recipient rather than a product.

---

## 5. Body model

An authored body (on `EmailTemplate.body`, and inline `Broadcast.body`) becomes a versioned,
ordered list of section **instances**:

```jsonc
{
  "version": 1,
  "sections": [
    { "id": "s_01H…", "type": "hero",                 "config": { … } },
    { "id": "s_02H…", "type": "rich-text",            "config": { "doc": { …CmsDoc } } },
    { "id": "s_03H…", "type": "recommended-products", "config": { "heading": "…", "limit": 3 } }
  ]
}
```

- `id` — stable per instance (client-minted, ULID-ish string); used as React key, drag id, and
  selection target.
- `type` — a key in the email section registry (§6/§8).
- `config` — the section's validated config (defaulted + parsed against its Zod schema).

**Legacy migration (lossless).** Existing authored bodies are a bare `CmsDoc` (`{type:'doc',…}`). On
read, a body lacking a `sections` array is wrapped into a single `rich-text` section
(`{version:1, sections:[{id, type:'rich-text', config:{doc:<the CmsDoc>}}]}`). No DB column change is
required — `body` is already `Json`. The wrap happens in a single `normalizeBody()` helper so every
caller (preview, render, editor load) sees the section-list shape.

---

## 6. Section catalog (v1)

Defined in `@sparx/email-sections` (§8). Each entry is `{ type, tier, label, description, icon,
schema (Zod), fields (descriptors) }` — the same registry shape as `@sparx/sitebuilder-schemas`,
plus `tier`.

**Static**

- `heading` — text, level (h1/h2), align.
- `rich-text` — a `CmsDoc` (the existing TipTap editor); serialized via `@sparx/cms-editor/serialize`.
- `image` — media id (CMS media picker), alt, link, width.
- `button` — label, url, align.
- `divider`, `spacer` — layout atoms.

**Dynamic** (tenant-level, resolved once per send)

- `featured-products` — source (`newest | collection | manual`), collectionId/productIds, columns, limit.
- `collection-grid` — collection tiles.
- `latest-blog-posts` — CMS `post`-typed entries, limit, layout.
- `active-promotion` — the tenant's current promo/discount banner.

**Personalized** (per recipient, resolved at dispatch)

- `abandoned-cart` — the recipient's open cart line items + a recover CTA.
- `recommended-products` — recommendations from the recipient's history, with a `fallback`
  (best-sellers / hide) when no signal exists.
- `recent-order` — the recipient's latest order summary + status.
- `loyalty-points` — the recipient's points/rewards balance.

Every data-bound section carries an explicit **fallback** (show alternate / hide block) so a
recipient with no data never yields an empty or broken section. Fallback is part of the section's
config and is honored by both the resolver and "preview as recipient."

---

## 7. Render pipeline

### 7.1 Two paths, chosen by tier

```
body.sections ──► partition by tier
   │
   ├─ no `personalized` section  ──► RENDER ONCE
   │      resolve dynamic data (tenant) once
   │      render whole body → html/text once
   │      fan out the same raw payload to every recipient   (today's pipeline, unchanged)
   │
   └─ has `personalized` section ──► RENDER PER RECIPIENT
          resolve dynamic data (tenant) once  → snapshot
          per ScheduledSend: resolve personalized data (recipient) → render this recipient's html/text
```

The render-once path is the existing broadcast/authored flow (one `renderAuthoredEmail`, raw
payload per `ScheduledSend`). The per-recipient path moves the render **into dispatch**: the
`ScheduledSend.payload` carries the section list + the tenant dynamic-data snapshot + the
`customerId`; the worker resolves the recipient's personalized data and renders that recipient's
message. Volume in Phase 1 is modest; correctness and simplicity beat fragment-caching — we render
the whole message per recipient when any block is personalized.

### 7.2 Data resolution layer

A `section-data` resolver in `@sparx/email-platform` (server-side; reads Commerce/CMS/CRM through
their service layers — never new schema, per [docs/02](02-architecture-overview.md)):

```ts
resolveSectionData(ctx, section, recipient?): Promise<SectionData>
```

- `static` → returns `{}` (no data).
- `dynamic` → tenant query (featured products, blog posts, promo). `recipient` ignored.
- `personalized` → requires `recipient` (`{ customerId, email }`); returns the recipient-bound
  data, or the section's configured fallback when empty.

The resolver is the **only** place that reaches into other modules; renderers (§8) are pure
`(config, data) → React Email` and never fetch.

### 7.3 Rendering

`@sparx/email` gains one React Email component per section type and a `renderSections(sections,
dataById, { brand })` composer that maps each instance → its component, wraps the result in
`<BrandProvider>` + `<EmailLayout>`, and renders to inlined `html` + `text`. Brand is threaded
exactly as today (§10). Renderers are email-safe (inlined styles, `<img>`/`<a>`, table layout) —
they share **schemas** with the storefront, never **renderers**.

---

## 8. Packages & boundaries

| Concern                                              | Home                                         | Notes                                                                            |
| ---------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| Section schemas, registry, `tier`, field descriptors | **`@sparx/email-sections`** (new, zod-only)  | Mirrors `@sparx/sitebuilder-schemas` structure; no React, importable everywhere. |
| Section renderers + `renderSections()`               | **`@sparx/email`**                           | React Email components; brand via context.                                       |
| Body model types + `normalizeBody()`                 | **`@sparx/email-sections`**                  | Shared by service, REST, dashboard.                                              |
| Data resolution (`resolveSectionData`)               | **`@sparx/email-platform`**                  | Reads Commerce/CMS/CRM via their services.                                       |
| Render orchestration (path choice, per-recipient)    | **`@sparx/email-platform`** + `email-worker` | §7.1.                                                                            |
| Composer UI                                          | **`apps/dashboard`** (`/email/.../design`)   | §9.                                                                              |

`@sparx/email-sections` is the only new package. It is deliberately a **structural mirror** of
`@sparx/sitebuilder-schemas` (same `SectionField`/registry/`parseSectionConfig` shapes) so the
eventual shared section kernel (§12) absorbs both. It does **not** import sitebuilder-schemas
(avoids coupling email to the in-flight redesign).

---

## 9. The dashboard composer

A full-bleed workspace (§3) with three regions, all built from `@sparx/ui` (no raw Tailwind in
feature code, per [docs/23](23-frontend-component-architecture.md)).

### 9.1 Palette (left)

Sections grouped by tier with a colored dot per tier (static = slate, dynamic = amber,
personalized = sky). Each item is draggable into the canvas; clicking inserts at the current
insertion point. Visual section cards, not a bare text list (doc 30 §10).

### 9.2 Canvas (center)

The branded email, rendered live. Hover between blocks reveals a **`+` insertion point**; each block
shows a **drag handle** and, for dynamic/personalized blocks, a **tier badge**. Click selects →
inspector opens. Reorder via `@dnd-kit` (already a workspace dependency — doc 30 §3). Device toggles
(desktop/mobile) and a dark toggle live once, in the status bar. The canvas renders the _real_ email
HTML (the same `renderSections` output) inside a sized frame.

### 9.3 Inspector (right)

Field-driven config for the selected section, generated from its `fields` descriptors via a shared
`FieldControl` (the same descriptor→control mapping the Site Builder uses; reimplemented in the
email composer for now, converged later). For data-bound sections it also shows the **data source**
control and **fallback**; for personalized sections, a **"spot-check a recipient"** picker.

**Preview as recipient (status bar + inspector).** Selecting a recipient re-renders the canvas with
that customer's resolved Dynamic + Personalized data (via `resolveSectionData` behind a preview
endpoint). The default is a synthetic sample recipient so the canvas is never empty.

### 9.4 Replacing the current editor

The single-`ContentBlockEditor` authored form ([apps/dashboard/.../email/templates/\_components/authored-form.tsx](<../apps/dashboard/app/(dashboard)/email/templates/_components/authored-form.tsx>))
is replaced by the composer. The TipTap editor survives **inside** the `rich-text` section's
inspector. A template's detail page links into the full-bleed designer.

---

## 10. Brand

The composer renders through the existing `resolveEmailBrand(ctx)` resolver, threaded as
`BrandTokens` through `<BrandProvider>` (today: Commerce `StorefrontTheme` → Sparx defaults; doc 30
§6 Phase 1 rewires it to the tenant-level `TenantBrand`). The composer **never** introduces a
per-email brand control — consistent with doc 30 §6.2 (consumers read brand, never override) and the
already-removed `EmailSettings` brand-color field. "Preview as recipient" changes _data_, not brand.

---

## 11. Delivery phases (deploy early, deploy small)

Each phase is independently shippable; the body model supports all three tiers from phase 1 even
though personalization renders later.

- **P1 — `@sparx/email-sections`.** Section-instance + body model, `normalizeBody()`, field
  descriptors, tier-tagged registry, the v1 catalog's Zod schemas, `parseSectionConfig`/defaults,
  unit tests. _Ships: the catalog + validation, no behavior change yet._
- **P2 — Renderers (`@sparx/email`).** One React Email component per section type + `renderSections`;
  static + dynamic render correctly given data; render tests. _Ships: section bodies can be rendered._
- **P3 — Service wiring (`@sparx/email-platform`).** `resolveSectionData` (static + dynamic);
  template/broadcast services consume section-list bodies; legacy `normalizeBody` on read; preview
  endpoint renders the section list. Render-once path end to end. _Ships: section templates send
  (static + dynamic)._
- **P4 — Composer UI.** The full-bleed designer (palette · canvas · inspector · insert points · DnD ·
  field forms), replacing the authored form; live branded canvas. _Ships: merchants compose visually._
- **P5 — Personalization.** Per-recipient render path (dispatch/worker); personalized resolvers
  (cart, recommendations, recent order, loyalty); "preview as recipient." _Ships: per-recipient
  email._
- **P6 — Broadcasts + polish.** Broadcasts author on the composer; Dockerfile wiring for the new
  package across consumers; analytics; static checks green.

---

## 12. Convergence with the shared kernel

The Site Builder redesign keeps its section registry in `@sparx/sitebuilder-schemas` and is
extending it with bound sections (doc 30 §4.2, §11). `@sparx/email-sections` is built as a
**structural twin** so that, once both surfaces are stable, a `@sparx/sections-core` can be
extracted holding the surface-agnostic primitives — the `SectionField` descriptor types, the
registry mechanism (`parseSectionConfig`/`defaultSectionConfig`/`isType`), the section-instance +
body model, and the composer shell — with **web** and **email** each contributing a catalog
(section types + `tier`/`scope`) and a renderer (storefront React vs. React Email). Until then,
the small duplication (the `SectionField` type, the registry helpers) is the deliberate cost of not
coupling email to an in-flight redesign. No email decision in this doc blocks that extraction.

---

## 13. Open questions

- **13.1 Recommendation source.** v1 `recommended-products` resolves from order/browse history via
  the Commerce service; whether to add a collaborative-filtering signal is deferred.
- **13.2 Per-recipient render cost.** Render-per-recipient is acceptable at Phase-1 volume; if a
  broadcast to a very large segment with personalized blocks becomes a hotspot, revisit
  fragment-caching (render shared prefix once, splice per-recipient fragments). Logged, not built.
- **13.3 Cross-surface field controls.** The email composer reimplements `FieldControl` rather than
  importing the Site Builder's; revisit when the shared kernel (§12) is extracted.
- **13.4 Scheduled personalized sends.** Personalized data resolves at dispatch (not at
  schedule/enqueue), so a scheduled send reflects the recipient's state at send time — confirm this
  is the desired semantic for `recent-order`/`loyalty-points` (lean: yes, send-time is correct).
