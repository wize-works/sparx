# Sparx Brand Guide

**Version:** 1.1
**Author:** Brandon Korous / WizeWorks
**Last Updated:** 2026-05-27

---

## 1. Brand Identity

**Platform:** Sparx
**Company:** WizeWorks
**Primary domain:** sparx.works
**Tagline:** Commerce, ignited.

Sparx is a modular commerce operating system. The brand communicates precision, intelligence, and simplicity — not corporate friendliness or startup energy. The name contains a spark: the moment something ignites, the instant a business goes live.

---

## 2. The Wordmark

```
Spar x
    ↑
    The "x" renders in Sparx Indigo (#6366F1)
    Everything else renders in primary text color
```

- Set in Geist, weight 500, tracking -0.03em
- The "x" is the brand moment — it is always colored, never neutral
- Never render the full wordmark in a single color
- Never use the wordmark at sizes below 16px
- Minimum clear space: equal to the height of the "S" on all sides

---

## 3. Color System

### Primary Brand Color

| Token | Hex | Use |
|-------|-----|-----|
| `--sparx-primary` | `#6366F1` | Buttons, links, active states, the "x" in wordmark |
| `--sparx-primary-hover` | `#4F46E5` | Hover state |
| `--sparx-primary-light` | `#818CF8` | Dark mode variant |
| `--sparx-primary-tint` | `#EEF2FF` | Background tints |

### Module Color System

Each module owns one color. This color appears identically across three touchpoints:
1. The module's marketing domain (sparxcms.com, sparxcrm.com, etc.)
2. The module's nav item in the Sparx dashboard sidebar
3. The 3px top stripe on all cards within that module

| Module | Color Name | Hex | Why |
|--------|-----------|-----|-----|
| Storefront | Indigo | `#6366F1` | The platform color — Storefront IS the foundation |
| Commerce | Orange | `#F97316` | Action, conversion, energy — every "Buy Now" button ever |
| CMS | Teal | `#14B8A6` | Editorial, calm, focused — content creation energy |
| CRM | Cyan | `#06B6D4` | Connective, relational, people-centric |
| Email | Sky | `#0EA5E9` | Communication, reach, delivery |
| B2B/Wholesale | Slate | `#475569` | Serious, industrial, business-grade |
| AI/MCP | Rose | `#EC4899` | Premium, intelligent, unexpected — different in kind |
| Dropship | Emerald | `#10B981` | Growth, supply chain, organic |

### The AI/MCP Exception

The AI/MCP module is the only module that falls outside the cool/blue/green spectrum. Rose (`#EC4899`) was chosen deliberately:

- Every other AI product in 2023–24 reached for purple, teal, or blue
- Rose is completely unused in B2B SaaS AI branding
- It signals "this is different in kind" — the module that thinks, not just functions
- The Sparx Indigo + Rose pairing is near-complementary, creating natural hierarchy

### Color Rules

**What warm colors (amber, red, orange) are reserved for:**
- `--color-warning` (#F59E0B) — caution alerts, approaching limits
- `--color-danger` (#EF4444) — errors, destructive actions
- `--module-commerce` (#F97316) — Commerce module only

**What warm colors are never used for:**
- Decorative elements
- Other module identities
- Brand accents outside of their defined semantic roles

---

## 4. Typography

### Typeface: Geist

Geist is Vercel's open-source typeface, designed specifically for interfaces. It combines geometric precision with editorial warmth — exactly the balance Sparx needs between technical capability and merchant accessibility.

- **Display:** Geist 500, -0.025em tracking — page titles, hero headings
- **Heading:** Geist 500, 0 tracking — section headers, card titles
- **Body:** Geist 400, 1.6 line-height — descriptive copy, supporting text
- **Label:** Geist 500, 0.08em tracking, uppercase — section labels, badges, metadata

**Fallback stack:** `'Geist', 'Inter', system-ui, -apple-system, sans-serif`

### Two weights only

400 (regular) and 500 (medium). Never 600 or 700 — they feel heavy against the clean Sparx UI. The typographic hierarchy comes from size and spacing, not weight contrast.

### The Notion/Framer influence

Like Notion and Framer, Sparx lets typography do the heavy lifting. No decorative elements, no gradients, no illustrations in the UI. White space is intentional. Every element has a reason to exist.

---

## 5. Platform Palette

### Light Mode
| Purpose | Token | Value |
|---------|-------|-------|
| Page background | `--color-bg-page` | `#FAFAFA` |
| Surface (cards) | `--color-bg-surface` | `#FFFFFF` |
| Border | `--color-border` | `#E5E5E5` |
| Body text | `--color-text-primary` | `#0A0A0A` |
| Supporting text | `--color-text-secondary` | `#52525B` |
| Hint/placeholder | `--color-text-tertiary` | `#A1A1AA` |

### Dark Mode
| Purpose | Token | Value |
|---------|-------|-------|
| Page background | `--color-bg-page` | `#0F0F0F` |
| Surface (cards) | `--color-bg-surface` | `#1A1A1A` |
| Border | `--color-border` | `#2A2A2A` |
| Body text | `--color-text-primary` | `#F0F0F0` |
| Supporting text | `--color-text-secondary` | `#A1A1AA` |
| Hint/placeholder | `--color-text-tertiary` | `#52525B` |

Neither pure white nor pure black — this is the Notion trick. Near-white/near-black backgrounds feel intentional in both modes, never like an inverted screenshot.

---

## 6. Design Principles

### Flat by default
No gradients, drop shadows (except functional focus rings), or blur effects. Every surface is flat. Depth comes from border contrast, not shadows.

### Minimal chrome
The UI gets out of the way of the merchant's work. Navigation is always visible but never dominant. Empty states are helpful, not decorative.

### The 3px stripe rule
The single most important UI pattern in the Sparx dashboard: every card, panel, and page header within a module context carries a 3px top border in that module's color. It tells the merchant exactly where they are without any additional labeling.

### Module isolation
When a merchant is working inside the CMS module, the UI shifts subtly to teal accents. When they switch to AI/MCP, rose. The color transition reinforces the module context and makes the system feel coherent rather than arbitrary.

### Progressive disclosure
The onboarding path hides complexity. Advanced features (API keys, custom webhooks, MCP configuration, B2B pricing rules) exist but are never shown to a new merchant. The 5-minute path to live store is always clear.

### Mobile-first, always
Every Sparx surface — marketing pages, the merchant dashboard, customer-facing storefronts — must work and look intentional from a 320px phone to a 2560px monitor. Marketing pages in particular are read on phones far more than on desktops; a layout that "doesn't look great on mobile" is a broken layout. Display type uses fluid `clamp()` scaling rather than fixed pixel sizes; layouts reflow, never just shrink. See [docs/23 §13](23-frontend-component-architecture.md) for the implementation rules.

---

## 7. Voice & Tone

**Sparx speaks directly.** No hedging, no corporate softness, no "revolutionary" or "game-changing."

| Instead of | Sparx says |
|-----------|-----------|
| "Start your free trial today" | "Live in 5 minutes." |
| "Powerful features for growing businesses" | "Pay for what you use. Own everything." |
| "Our AI-powered insights help you understand your customers" | "Ask your AI anything about your business." |
| "Flexible pricing for every stage" | "Add B2B for $99/mo. No upgrade required." |

**Short sentences.** Subject, verb, done. Sparx doesn't explain itself — it demonstrates.

**Second person, present tense.** "Your store is live" not "Merchants can launch their stores."

---

## 8. Module Marketing Domains

Each module marketing domain uses its module color as the primary accent, with sparx.works' neutral palette as the base:

| Domain | Module | Accent |
|--------|--------|--------|
| sparx.works | Platform / Storefront | `#6366F1` |
| sparxcms.com | CMS | `#14B8A6` |
| sparxcrm.com | CRM | `#06B6D4` |
| sparxemail.com | Email | `#0EA5E9` |
| sparxb2b.com | B2B/Wholesale | `#475569` |

Each site is conversion-optimized for a specific search intent. All CTAs point to `sparx.works/signup?module={module}` — the module query param pre-selects the relevant module during onboarding.

---

## 9. What Sparx Is Not

- Not corporate blue (we left that on the table deliberately)
- Not startup teal (overused, and we're past that era)
- Not "AI purple" (the 2023-24 default that means nothing anymore)
- Not rounded and bubbly (we're precise, not friendly)
- Not gradient-heavy (flat is the point)
- Not dark-mode-only (both modes are first-class)

Sparx is the brand that would have designed the tool a senior developer wishes existed. Technical enough to be trusted. Simple enough for anyone to use.
