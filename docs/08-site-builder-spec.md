# WizeWorks Platform — Site Builder Specification

**Version:** 1.0  
**Author:** Brandon Korous  
**Last Updated:** 2026-05-27

---

## 1. Overview

The WizeWorks Site Builder enables merchants to launch a professional storefront in under 5 minutes, with no code required. It follows a **theme-first architecture** — merchants select a theme, customize colors, fonts, and content, and publish. Power users and developers can build fully custom frontends that connect to the WizeWorks API.

---

## 2. Architecture: Two Tiers

### Tier 1 — Theme System (All Plans)

- Curated, industry-optimized themes
- Merchant customizes via settings panel (no code)
- Rendered by the platform's Next.js storefront service
- Updates to theme engine automatically benefit all merchants on that theme

### Tier 2 — Headless API (Pro + Enterprise)

- Merchant (or their developer) builds any frontend
- Connects to WizeWorks REST/GraphQL API
- Platform manages all commerce, CRM, email, MCP logic
- Custom frontend is just a UI skin on the same backend
- No site builder UI required — pure API

---

## 3. Theme System

### Theme Structure

```
theme/
├── theme.json          # Metadata, settings schema
├── layout/
│   ├── base.tsx        # Root layout (header, footer, nav)
│   └── checkout.tsx    # Checkout layout
├── sections/           # Composable page sections
│   ├── hero.tsx
│   ├── featured-products.tsx
│   ├── testimonials.tsx
│   ├── collection-grid.tsx
│   ├── rich-text.tsx
│   ├── image-banner.tsx
│   └── email-signup.tsx
├── pages/
│   ├── home.tsx
│   ├── product.tsx
│   ├── collection.tsx
│   ├── cart.tsx
│   ├── checkout.tsx
│   ├── account.tsx
│   └── [cms-page].tsx
└── styles/
    └── tokens.css      # CSS custom properties (colors, fonts, spacing)
```

### theme.json Schema

```json
{
  "name": "Apex",
  "version": "1.0.0",
  "category": "general",
  "settings": {
    "colors": {
      "primary": { "type": "color", "default": "#CC1010", "label": "Primary Color" },
      "background": { "type": "color", "default": "#FFFFFF", "label": "Background" },
      "text": { "type": "color", "default": "#1A1A1A", "label": "Text Color" }
    },
    "typography": {
      "heading_font": { "type": "font", "default": "Inter", "label": "Heading Font" },
      "body_font": { "type": "font", "default": "Inter", "label": "Body Font" }
    },
    "layout": {
      "container_width": { "type": "select", "options": ["narrow", "medium", "wide", "full"] }
    }
  }
}
```

### Initial Theme Library

| Theme          | Category            | Style                    |
| -------------- | ------------------- | ------------------------ |
| **Apex**       | General             | Clean, modern, versatile |
| **Industrial** | B2B / Parts         | Dark, bold, technical    |
| **Drift**      | Fashion / Lifestyle | Editorial, image-forward |
| **Market**     | Food / Specialty    | Warm, artisan            |
| **Fleet**      | B2B / Fleet         | Data-dense, professional |
| **Drop**       | Dropship            | Product-grid focused     |

---

## 4. Visual Customizer

The customizer panel renders alongside the live storefront preview. Changes are reflected in real-time without page reload.

### Customizer Panels

1. **Theme** — Switch theme (shows migration warning if content structure differs)
2. **Colors** — Primary, secondary, background, text, accent
3. **Fonts** — Heading and body font selection (Google Fonts catalog)
4. **Header** — Logo upload, nav links, announcement bar
5. **Footer** — Links, social media, copyright text
6. **Homepage** — Drag to reorder sections, show/hide sections
7. **Sections** — Per-section content editing (hero image, heading, CTA text)
8. **CSS** — (Advanced) Custom CSS injection

### Section Editing

Each section exposes its own settings:

```
Hero Section Settings:
├── Background image (upload or URL)
├── Heading text
├── Subheading text
├── CTA button label
├── CTA button URL
├── Text alignment (left / center / right)
└── Overlay opacity (0–100%)
```

---

## 5. Page Builder (Homepage + CMS Pages)

The homepage and CMS landing pages use a **section-based page builder**:

- Sections are added from a library (hero, product grid, text block, image, testimonials, etc.)
- Sections can be reordered via drag-and-drop
- Each section has its own settings panel
- Pages can be duplicated as templates
- SEO fields (title, description, OG image) per page

This is explicitly NOT a full drag-and-drop visual editor (that's a v2 feature). It's section-based composition — powerful enough for 95% of merchant needs, simple enough to learn in 2 minutes.

---

## 6. 5-Minute Onboarding Flow

```
Step 1: Business Info (30 sec)
├── Business name
├── Business category (dropdown: general / B2B / fashion / food / etc.)
└── Logo upload (optional — can skip)

Step 2: Theme (45 sec)
├── Platform recommends theme based on category
├── Merchant previews 2-3 options
└── Selects theme — store renders live instantly

Step 3: First Product (90 sec)  [or connect dropship supplier]
├── Product title
├── Price
├── Photo (upload or skip)
└── "Add Product" → live on store

Step 4: Domain (30 sec)
├── Subdomain auto-generated from business name
├── Merchant can accept or change slug
└── Store is live at slug.wizeworks.com

Step 5: Payments (60 sec)
├── "Connect Stripe" (OAuth — one click)
├── Or "Skip for now" (store visible, checkout disabled)
└── Done — store is live and taking orders

Total: ~4.5 minutes
```

### Progressive Disclosure

The following features exist but are NOT shown during onboarding:

- Custom domain
- Email automations
- B2B / wholesale settings
- Dropship suppliers
- CRM pipeline
- MCP / AI settings
- Advanced SEO
- Webhooks / API keys

They're accessible from the dashboard sidebar but don't block the path to live.

---

## 7. Headless / Custom Frontend Integration

For Enterprise clients (like Gillett Diesel) who want a fully custom frontend:

### API Access

```
Base URL: https://api.wizeworks.com/v1
Auth: Bearer token (merchant API key)
Content-Type: application/json

# Or GraphQL:
Endpoint: https://api.wizeworks.com/graphql
```

### Example: Fetch Products

```typescript
const response = await fetch('https://api.wizeworks.com/v1/products', {
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'X-Tenant-ID': TENANT_ID,
  },
});
const { products } = await response.json();
```

### Storefront SDK (Published NPM Package)

```bash
npm install @wizeworks/storefront-sdk
```

```typescript
import { WizeWorks } from '@wizeworks/storefront-sdk';

const ww = new WizeWorks({
  tenantId: process.env.WW_TENANT_ID,
  apiKey: process.env.WW_API_KEY,
  environment: 'production',
});

const products = await ww.products.list({ status: 'active' });
const cart = await ww.cart.create();
await ww.cart.addItem(cart.id, { variantId, quantity: 1 });
const order = await ww.checkout.complete(cart.id, paymentDetails);
```

The SDK is a thin type-safe wrapper over the REST API. The same SDK powers WizeWorks' own theme system.
