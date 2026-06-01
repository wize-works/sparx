'use server';

import { revalidatePath } from 'next/cache';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import { resolveMediaUrl } from './api';
import type { PresentationOverlayV2 } from '@sparx/storefront-themes';
import type {
  AppearancePolicy,
  BrandDto,
  PageLayoutDto,
  SiteConfigDto,
  SiteLayoutBlockDto,
  SitePublishScheduleDto,
  SiteSectionDto,
  SiteSettingsDto,
  SiteThemeDto,
  SiteVersionDto,
} from './types';

// Thin server-action adapters over api-rest. Server actions inherit the
// session + JWT secret (held only on the dashboard server) and integrate with
// revalidatePath, so the customizer never talks to api-rest from the browser.

export interface ActionResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath('/sitebuilder', 'layout');
    return { ok: true, data };
  } catch (err) {
    const e = err as ApiRestError;
    return { ok: false, error: e.message ?? 'Something went wrong.' };
  }
}

export async function selectTheme(themeKey: string): Promise<ActionResult<SiteConfigDto>> {
  return run(() => api.put<SiteConfigDto>('/v1/sitebuilder/config/theme', { themeKey }));
}

export async function updateSettings(input: {
  settings?: SiteSettingsDto;
  appearancePolicy?: AppearancePolicy;
}): Promise<ActionResult<SiteConfigDto>> {
  return run(() => api.patch<SiteConfigDto>('/v1/sitebuilder/config/settings', input));
}

// ── Saved themes (docs/33 saved-themes contract) ───────────────────────────
// The merchant's named theme variants. These hit /v1/sitebuilder/saved-themes,
// which the Site Builder owner is landing; until then they return ok:false and
// the UI surfaces the error inline (the prebuilt-preset flow is unaffected).
// `apply` loads a saved theme's basePreset + presentation into the draft config.
export async function saveTheme(input: {
  name: string;
  basePresetKey: string;
  presentation: PresentationOverlayV2;
}): Promise<ActionResult<SiteThemeDto>> {
  return run(() => api.post<SiteThemeDto>('/v1/sitebuilder/saved-themes', input));
}

export async function renameTheme(id: string, name: string): Promise<ActionResult<SiteThemeDto>> {
  return run(() => api.patch<SiteThemeDto>(`/v1/sitebuilder/saved-themes/${id}`, { name }));
}

export async function deleteSavedTheme(id: string): Promise<ActionResult> {
  return run(() => api.delete<void>(`/v1/sitebuilder/saved-themes/${id}`));
}

export async function applySavedTheme(id: string): Promise<ActionResult<SiteConfigDto>> {
  return run(() => api.post<SiteConfigDto>(`/v1/sitebuilder/saved-themes/${id}/apply`, {}));
}

export async function createSection(input: {
  pageLayoutId: string;
  sectionType: string;
  config?: Record<string, unknown>;
  position?: number;
}): Promise<ActionResult<SiteSectionDto>> {
  return run(() => api.post<SiteSectionDto>('/v1/sitebuilder/sections', input));
}

// "Customize this layout" (docs/36 §3): resolve-or-create the target's page layout
// and, if still empty, copy the code-defined default into real section rows.
// Idempotent — a customized layout is returned untouched.
export async function materializeLayout(input: {
  targetId: string;
  key?: string;
}): Promise<ActionResult<{ pageLayout: PageLayoutDto; sections: SiteSectionDto[] }>> {
  return run(() =>
    api.post<{ pageLayout: PageLayoutDto; sections: SiteSectionDto[] }>(
      '/v1/sitebuilder/page-layouts/materialize',
      input
    )
  );
}

export async function updateSection(
  id: string,
  input: { config?: Record<string, unknown>; visible?: boolean }
): Promise<ActionResult<SiteSectionDto>> {
  return run(() => api.patch<SiteSectionDto>(`/v1/sitebuilder/sections/${id}`, input));
}

export async function reorderSections(
  pageLayoutId: string,
  orderedIds: string[]
): Promise<ActionResult<{ sections: SiteSectionDto[] }>> {
  return run(() =>
    api.post<{ sections: SiteSectionDto[] }>('/v1/sitebuilder/sections/reorder', {
      pageLayoutId,
      orderedIds,
    })
  );
}

export async function removeSection(id: string): Promise<ActionResult> {
  return run(() => api.delete<void>(`/v1/sitebuilder/sections/${id}`));
}

export async function upsertLayout(
  slot: 'header' | 'footer' | 'announcement',
  input: { navigationMenuId?: string | null; config?: Record<string, unknown>; visible?: boolean }
): Promise<ActionResult<SiteLayoutBlockDto>> {
  return run(() => api.put<SiteLayoutBlockDto>(`/v1/sitebuilder/layout/${slot}`, input));
}

// Brand is tenant-level (docs/30 §6) — PATCH merges the provided fields into
// the single tenant_brands row. All fields optional; a present null clears.
export type BrandPatch = Partial<Omit<BrandDto, 'tenantId'>>;

export async function updateBrand(input: BrandPatch): Promise<ActionResult<BrandDto>> {
  return run(() => api.patch<BrandDto>('/v1/brand', input));
}

// Resolve a freshly-picked/uploaded asset id to a preview URL for the brand
// board, without touching revalidation (pure read).
export async function resolveBrandMedia(mediaId: string | null): Promise<string | null> {
  return resolveMediaUrl(mediaId);
}

export async function publishNow(note?: string): Promise<ActionResult<SiteVersionDto>> {
  return run(() => api.post<SiteVersionDto>('/v1/sitebuilder/publish', { note }));
}

export async function rollback(versionId: string): Promise<ActionResult<SiteVersionDto>> {
  return run(() => api.post<SiteVersionDto>('/v1/sitebuilder/rollback', { versionId }));
}

export async function schedulePublish(
  scheduledAt: string,
  note?: string
): Promise<ActionResult<SitePublishScheduleDto>> {
  return run(() =>
    api.post<SitePublishScheduleDto>('/v1/sitebuilder/schedule', { scheduledAt, note })
  );
}

export async function cancelSchedule(id: string): Promise<ActionResult<SitePublishScheduleDto>> {
  return run(() => api.delete<SitePublishScheduleDto>(`/v1/sitebuilder/schedules/${id}`));
}
