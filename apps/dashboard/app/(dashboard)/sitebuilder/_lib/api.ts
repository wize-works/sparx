// Server-only Site Builder API readers. Thin wrappers over the api-rest client
// used by the module's server components. Mutations live in actions.ts.

import 'server-only';
import { api } from '@/lib/api-rest-client';
import type {
  BrandDto,
  NavMenuDto,
  PageLayoutDto,
  SiteConfigDto,
  SiteLayoutBlockDto,
  SitePublishScheduleDto,
  SiteSectionDto,
  SiteThemeDto,
  SiteVersionDto,
  TenantDto,
  ThemeDto,
} from './types';

export function getTenant(): Promise<TenantDto> {
  return api.get<TenantDto>('/v1/tenant');
}

export function getConfig(): Promise<SiteConfigDto> {
  return api.get<SiteConfigDto>('/v1/sitebuilder/config');
}

export async function listThemes(): Promise<ThemeDto[]> {
  const { themes } = await api.get<{ themes: ThemeDto[] }>('/v1/sitebuilder/themes');
  return themes;
}

// The tenant's saved theme variants (docs/33 saved-themes contract). A surface
// the dashboard owns at /v1/sitebuilder/saved-themes; until api-rest lands it
// the call 404s and we degrade to an empty list (the prebuilt presets still
// render from the package). Shape-filtered so a transitional endpoint can't
// surface mistyped rows.
export async function listSavedThemes(): Promise<SiteThemeDto[]> {
  try {
    const { themes } = await api.get<{ themes?: unknown[] }>('/v1/sitebuilder/saved-themes');
    const rows = Array.isArray(themes) ? themes : [];
    return rows.filter(
      (t): t is SiteThemeDto =>
        typeof t === 'object' && t !== null && 'id' in t && 'presentation' in t
    );
  } catch {
    return [];
  }
}

// Page layouts the tenant has for a target (docs/36 §4). A target with no row has
// never been customized — the editor shows the seeded default read-only until then.
export async function listPageLayouts(targetId?: string): Promise<PageLayoutDto[]> {
  const qs = targetId ? `?target_id=${encodeURIComponent(targetId)}` : '';
  const { pageLayouts } = await api.get<{ pageLayouts: PageLayoutDto[] }>(
    `/v1/sitebuilder/page-layouts${qs}`
  );
  return pageLayouts;
}

// Resolve-or-create the page layout for a (targetId, key) — idempotent, like the
// lazily-materialized SiteConfig. Used on load by the always-editable targets
// (site:home, cms:content-page slug pages) so the editor has a pageLayoutId to
// address before the first section exists. Products/Collections deliberately
// DON'T call this on load — they gate creation behind the explicit "Customize".
export function resolvePageLayout(targetId: string, key?: string): Promise<PageLayoutDto> {
  return api.post<PageLayoutDto>('/v1/sitebuilder/page-layouts', { targetId, key });
}

// A page layout's ordered sections (pageLayoutId-native list).
export async function listSectionsByPageLayout(pageLayoutId: string): Promise<SiteSectionDto[]> {
  const { sections } = await api.get<{ sections: SiteSectionDto[] }>(
    `/v1/sitebuilder/sections?page_layout_id=${encodeURIComponent(pageLayoutId)}`
  );
  return sections;
}

export async function listLayout(): Promise<SiteLayoutBlockDto[]> {
  const { blocks } = await api.get<{ blocks: SiteLayoutBlockDto[] }>('/v1/sitebuilder/layout');
  return blocks;
}

export async function listVersions(): Promise<SiteVersionDto[]> {
  const { data } = await api.getPaged<SiteVersionDto[]>('/v1/sitebuilder/versions');
  return data;
}

export async function listSchedules(): Promise<SitePublishScheduleDto[]> {
  const { schedules } = await api.get<{ schedules: SitePublishScheduleDto[] }>(
    '/v1/sitebuilder/schedules'
  );
  return schedules;
}

// Tenant brand — the tenant-level source of truth (docs/30 §6). Ungated
// (/v1/brand is platform-level like /v1/tenant), so this read works regardless
// of which modules are enabled.
export function getBrand(): Promise<BrandDto> {
  return api.get<BrandDto>('/v1/brand');
}

interface AssetVariant {
  format: string;
  width: number;
  url: string;
}

// Resolve a media asset id to a browser-usable URL for the brand board
// preview. Prefers a ~512w webp, falls back to the first variant. Returns null
// when the id is absent or the asset can't be read (e.g. still transcoding).
export async function resolveMediaUrl(mediaId: string | null): Promise<string | null> {
  if (!mediaId) return null;
  try {
    const asset = await api.get<{ variants?: AssetVariant[] }>(`/v1/media/assets/${mediaId}`);
    const variants = asset.variants ?? [];
    if (variants.length === 0) return null;
    const webp = variants
      .filter((v) => v.format === 'webp')
      .sort((a, b) => Math.abs(a.width - 512) - Math.abs(b.width - 512));
    return webp[0]?.url ?? variants[0]?.url ?? null;
  } catch {
    return null;
  }
}

// Navigation menus are CMS-owned content (docs/30 §8); Site Builder reads them
// read-only — via the module-neutral /v1/navigation endpoints — to populate the
// layout-slot menu picker. The menu trees are edited under /cms/navigation.
export function listMenus(): Promise<NavMenuDto[]> {
  return api.get<NavMenuDto[]>('/v1/navigation/menus');
}

// Mint a short-lived site-preview token so the storefront preview iframe renders
// the tenant's DRAFT composition instead of the published snapshot. Re-minted on
// every render; null when minting fails (the preview then shows published).
export async function getSitePreviewToken(): Promise<string | null> {
  try {
    const { token } = await api.get<{ token: string }>('/v1/sitebuilder/preview-token');
    return token;
  } catch {
    return null;
  }
}
