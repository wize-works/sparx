// Server-only Site Builder API readers. Thin wrappers over the api-rest client
// used by the module's server components. Mutations live in actions.ts.

import 'server-only';
import { api } from '@/lib/api-rest-client';
import type {
  NavMenuDto,
  SiteConfigDto,
  SiteLayoutBlockDto,
  SitePublishScheduleDto,
  SiteSectionDto,
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

export async function listSections(pageKey = 'home'): Promise<SiteSectionDto[]> {
  const { sections } = await api.get<{ sections: SiteSectionDto[] }>(
    `/v1/sitebuilder/sections?page_key=${encodeURIComponent(pageKey)}`
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
