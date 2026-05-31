// DTO shapes returned by the Site Builder REST endpoints. Kept as plain
// interfaces (not the Prisma row types) so client components can import them
// without pulling the service package / Prisma into the browser bundle.

import type { BrandTokenDoc, PresentationOverlayV2, ThemePreset } from '@sparx/storefront-themes';

export type ThemeDto = ThemePreset;

export type AppearancePolicy = 'light-only' | 'dark-only' | 'auto' | 'toggle';

export interface SiteSettingsDto {
  tokens?: { light?: Record<string, string>; dark?: Record<string, string> };
  customCss?: string;
  // Token Model v2 presentation overlay (docs/33), edited by the theme inspector.
  presentation?: PresentationOverlayV2;
}

export interface SiteConfigDto {
  tenantId: string;
  themeKey: string;
  appearancePolicy: AppearancePolicy;
  draftSettings: SiteSettingsDto;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSectionDto {
  id: string;
  // Phase 3: sections hang off a scoped SiteTemplate; the editor addresses them
  // by `templateId` (+ the owning template's scope/key).
  templateId: string;
  scope: string;
  templateKey: string;
  sectionType: string;
  position: number;
  visible: boolean;
  config: Record<string, unknown>;
}

// A scoped page layout (docs/handoffs/sitebuilder-phase3-spec.md §3). The editor
// resolves one per scope (home | product | collection | cms-page | custom),
// then does section CRUD by `id`.
export interface SiteTemplateDto {
  id: string;
  scope: string;
  key: string;
  name: string;
}

// A storefront item the Layouts editor can bind its live preview to — a real
// product/collection so a `product`/`collection` template renders against actual
// data (spec §7, "Preview against [sample ▾]"). Editor-local; not site data.
export interface SampleItem {
  handle: string;
  label: string;
}

export interface SiteLayoutBlockDto {
  id: string;
  slot: 'header' | 'footer' | 'announcement';
  navigationMenuId: string | null;
  config: Record<string, unknown>;
  visible: boolean;
}

export interface SiteVersionDto {
  id: string;
  versionNumber: number;
  themeKey: string;
  appearancePolicy: AppearancePolicy;
  note: string | null;
  publishedById: string | null;
  createdAt: string;
}

export interface SitePublishScheduleDto {
  id: string;
  scheduledAt: string;
  status: 'pending' | 'published' | 'cancelled' | 'failed';
  note: string | null;
  processedAt: string | null;
  resultVersionId: string | null;
  error: string | null;
  createdAt: string;
}

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
}

// Tenant brand — the platform-wide source of truth for brand identity
// (docs/30 §6). Tenant-level, above every module: read-only to consumers
// (email, CRM, the storefront theme). Edited here in the Site Builder, but the
// record is owned at the tenant level, not by the Storefront module. Media
// fields store asset ids; the panel resolves them to URLs for the brand board
// preview via `resolveMediaUrl`.
export interface BrandDto {
  tenantId: string;
  businessName: string | null;
  tagline: string | null;
  logoLightMediaId: string | null;
  logoDarkMediaId: string | null;
  faviconMediaId: string | null;
  colorPrimary: string | null;
  colorPrimaryForeground: string | null;
  colorAccent: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  // Brand-owned Token Model v2 shape/rhythm/effect (docs/33). Null = inherit the
  // theme preset. Colour/type stay in the dedicated fields above.
  tokens: BrandTokenDoc | null;
  socials: Record<string, string>;
}

// Best-fit asset URLs for the three brand images, resolved server-side so the
// board preview can render logos on first paint without a client round-trip.
export interface BrandMediaUrls {
  logoLight: string | null;
  logoDark: string | null;
  favicon: string | null;
}

// Navigation menus are CMS-owned content (docs/30 §8); Site Builder reads this
// shape read-only to bind a menu into a layout slot. api-rest returns items as
// a flat list spanning every depth (the Prisma include is non-recursive); the
// listing only needs top-level counts, so we keep `parentItemId` to filter.
export interface NavMenuDto {
  id: string;
  location: string;
  name: string;
  items: { id: string; parentItemId: string | null }[];
}
