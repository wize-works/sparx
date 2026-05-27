# Sparx Platform — CMS PRD

**Version:** 2.0
**Author:** Brandon Korous
**Last Updated:** 2026-05-27

---

## 1. Overview

The Sparx CMS is a **standalone module** — it can be activated with or without Commerce. A content publisher, blogger, documentation site, or portfolio can run entirely on Sparx CMS ($49/mo) without ever activating the Commerce module.

When combined with Commerce, the CMS powers product descriptions, landing pages, and the blog. When used standalone, it is a full headless CMS with a visual editor, media library, SEO tools, and API access.

This deliberate separation is a core Sparx differentiator — merchants pay for what they use.

---

## 2. Standalone CMS Use Cases

**Content publishers:**
- Blog or editorial site (activate Storefront + CMS = $98/mo)
- Documentation site for a SaaS product
- Portfolio or agency site
- Resource library

**Headless CMS (API-only, no Storefront):**
- Development teams querying Sparx CMS API to render content in their own frontend
- CMS module only ($49/mo) — no Storefront required
- Full REST + GraphQL access to all content

**Commerce + Content:**
- Product catalog + blog + landing pages (Storefront + Commerce + CMS)
- Standard e-commerce site with content marketing strategy

---

## 3. Content Types

### Pages (Static)
General-purpose pages: About, Contact, FAQ, Shipping Policy, Return Policy, Privacy Policy, Terms, custom landing pages, campaign pages.

### Blog Posts
Long-form content: SEO articles, product education, how-to guides, company news, industry resources. Full author management, categories, tags, scheduled publishing.

### Product Descriptions (Commerce integration)
When Commerce module is active: rich text editor for product description field. Full formatting, embedded images, spec tables, embedded video.

### Custom Content Types (Pro+)
Merchants can define custom content schemas — e.g. "Case Studies" with fields: client name, industry, challenge, solution, result. Content rendered via API.

### Theme Sections
Homepage and collection page sections managed via Site Builder (visual customizer, not this CMS editor).

---

## 4. Page Editor

Built on **TipTap** (ProseMirror-based). Excellent DX. Extensible, TypeScript-native.

Capabilities:
- Headings H1–H4, paragraph, bold, italic, underline, strikethrough, inline code
- Ordered and unordered lists
- Blockquotes
- Tables (with column resize)
- Images (upload or from media library, with caption)
- Embedded video (YouTube, Vimeo URL)
- Code blocks (syntax highlighted)
- Horizontal rule
- Internal links (to any product, collection, page, post)
- External links (with rel=nofollow option)

Autosave every 30 seconds. Last 10 versions retained, any version restorable.

---

## 5. Media Library

### Supported Types
- Images: JPEG, PNG, WebP, GIF, SVG
- Documents: PDF, DOCX, XLSX (spec sheets, product manuals, guides)
- Video: MP4 (stored in GCS, streamed via CDN)

### Image Processing Pipeline
On upload:
1. Original stored in GCS (`/media/{tenantId}/originals/`)
2. WebP version generated
3. Responsive sizes: 400px, 800px, 1200px, 2000px width
4. Thumbnails for library grid view
5. All served via Cloudflare CDN

### Library UI
Grid view, search by filename/alt text, filter by type, sort by date/name/size, bulk delete, alt text editing, copy URL, usage count (how many pages reference this asset).

### Storage Limits
Starter 5GB | Growth 25GB | Pro 100GB | Business 250GB | Enterprise custom.

---

## 6. SEO Management

### Per-Page SEO Fields
- SEO title (max 60 chars, character counter)
- Meta description (max 160 chars, character counter)
- OG title and description (for social sharing)
- OG image (upload or select from media library)
- Canonical URL (for duplicate content)
- Robots directive (index/noindex, follow/nofollow)
- JSON-LD structured data (auto-generated for articles, products, organization)

### SEO Audit Panel
Inline checklist per page:
- Title length ✅/⚠️/❌
- Meta description length ✅/⚠️/❌
- H1 present and unique ✅/⚠️/❌
- Images have alt text ✅/⚠️/❌
- Internal links present ✅/⚠️/❌
- Word count estimate

### Sitemap
Auto-generated XML sitemap. Includes all active pages, posts, products (if Commerce active), collections. URL: `/sitemap.xml`. Submitted to Google Search Console on first publish and on content updates.

### Redirects
Manual 301 redirects. Auto-created when page/product slug changes (prevents SEO link rot). Bulk redirect import via CSV. Redirect chain and loop detection.

---

## 7. Blog

- Multiple authors (linked to staff accounts)
- Categories and tags
- Featured image with alt text
- Excerpt (manual or auto-generated)
- Publish date (future-dated for scheduled publish)
- Reading time estimate (auto-calculated)
- RSS feed at `/blog.rss`
- Related posts (by tag or category)
- JSON-LD Article structured data
- Auto-suggests internal links to products mentioned in text (when Commerce active)

---

## 8. Navigation Management

Merchants manage navigation menus:
- Header navigation (main nav)
- Footer navigation (multiple columns)
- Mega menu (images + featured collections for large catalogs)

Menu items link to: page, blog post, product, collection, external URL, or heading label.

---

## 9. Headless CMS API

All content available via REST and GraphQL — same endpoints as the full platform:

```
GET /v1/pages
GET /v1/pages/{id}
GET /v1/pages?slug=about-us
GET /v1/blog/posts
GET /v1/blog/posts/{id}
GET /v1/blog/posts?category=diesel-maintenance
GET /v1/media
GET /v1/navigation/{location}   (header, footer)
```

Authentication: API key with `read:content` scope.

Content types and custom fields are also queryable. This enables teams to use Sparx as a headless CMS feeding any frontend — Next.js, Astro, SvelteKit, native mobile, whatever.

The `@sparx/storefront-sdk` NPM package includes typed helpers for all content types.

---

## 10. Content Localization (Pro+)

Multiple languages with language variants per page/post. Language switcher on storefront. hreflang tags auto-generated. URL structure: subdirectory (`/fr/about`) or subdomain (`fr.theirdomain.com`). Separate SEO fields per language variant.
