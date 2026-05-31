// DTO shapes returned by the Site Builder REST endpoints. Kept as plain
// interfaces (not the Prisma row types) so client components can import them
// without pulling the service package / Prisma into the browser bundle.

import type { ThemePreset } from '@sparx/storefront-themes';

export type ThemeDto = ThemePreset;

export type AppearancePolicy = 'light-only' | 'dark-only' | 'auto' | 'toggle';

export interface SiteSettingsDto {
  tokens?: { light?: Record<string, string>; dark?: Record<string, string> };
  customCss?: string;
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
  pageKey: string;
  sectionType: string;
  position: number;
  visible: boolean;
  config: Record<string, unknown>;
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
