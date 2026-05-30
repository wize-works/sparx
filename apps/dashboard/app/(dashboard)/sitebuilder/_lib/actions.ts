'use server';

import { revalidatePath } from 'next/cache';
import { api, type ApiRestError } from '@/lib/api-rest-client';
import type {
  AppearancePolicy,
  SiteConfigDto,
  SiteLayoutBlockDto,
  SitePublishScheduleDto,
  SiteSectionDto,
  SiteSettingsDto,
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

export async function createSection(input: {
  pageKey?: string;
  sectionType: string;
  config?: Record<string, unknown>;
  position?: number;
}): Promise<ActionResult<SiteSectionDto>> {
  return run(() => api.post<SiteSectionDto>('/v1/sitebuilder/sections', input));
}

export async function updateSection(
  id: string,
  input: { config?: Record<string, unknown>; visible?: boolean }
): Promise<ActionResult<SiteSectionDto>> {
  return run(() => api.patch<SiteSectionDto>(`/v1/sitebuilder/sections/${id}`, input));
}

export async function reorderSections(
  pageKey: string,
  orderedIds: string[]
): Promise<ActionResult<{ sections: SiteSectionDto[] }>> {
  return run(() =>
    api.post<{ sections: SiteSectionDto[] }>('/v1/sitebuilder/sections/reorder', {
      pageKey,
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
