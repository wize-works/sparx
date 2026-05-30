// Write-input schemas shared by the service layer, REST routes, and MCP tools.
// Every mutation validates against one of these before touching Prisma.

import { z } from 'zod';
import { AppearancePolicy, LayoutSlot, OptionalUuid, ThemeKey, Uuid } from './common';
import { SectionTypeEnum } from './section-registry';
import { SiteSettings } from './site-settings';

export const SelectThemeInput = z.object({
  themeKey: ThemeKey,
});
export type SelectThemeInput = z.infer<typeof SelectThemeInput>;

export const UpdateSettingsInput = z.object({
  settings: SiteSettings.optional(),
  appearancePolicy: AppearancePolicy.optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;

// pageKey: "home" or a CMS page slug. Bounded to the column width.
export const PageKey = z.string().min(1).max(255);

export const CreateSectionInput = z.object({
  pageKey: PageKey.default('home'),
  sectionType: SectionTypeEnum,
  // Optional initial config; defaults are filled from the section schema.
  config: z.record(z.string(), z.unknown()).optional(),
  // Insert position; appended to the end when omitted.
  position: z.number().int().min(0).optional(),
});
export type CreateSectionInput = z.infer<typeof CreateSectionInput>;

export const UpdateSectionInput = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  visible: z.boolean().optional(),
});
export type UpdateSectionInput = z.infer<typeof UpdateSectionInput>;

export const ReorderSectionsInput = z.object({
  pageKey: PageKey,
  orderedIds: z.array(Uuid).min(1),
});
export type ReorderSectionsInput = z.infer<typeof ReorderSectionsInput>;

export const UpsertLayoutInput = z.object({
  slot: LayoutSlot,
  navigationMenuId: OptionalUuid,
  config: z.record(z.string(), z.unknown()).optional(),
  visible: z.boolean().optional(),
});
export type UpsertLayoutInput = z.infer<typeof UpsertLayoutInput>;

export const PublishInput = z.object({
  note: z.string().max(500).optional(),
});
export type PublishInput = z.infer<typeof PublishInput>;

export const RollbackInput = z.object({
  versionId: Uuid,
});
export type RollbackInput = z.infer<typeof RollbackInput>;

export const ScheduleInput = z.object({
  scheduledAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});
export type ScheduleInput = z.infer<typeof ScheduleInput>;
