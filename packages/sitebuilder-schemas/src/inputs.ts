// Write-input schemas shared by the service layer, REST routes, and MCP tools.
// Every mutation validates against one of these before touching Prisma.

import { z } from 'zod';
import { AppearancePolicy, LayoutSlot, OptionalUuid, ThemeKey, Uuid } from './common';
import { ScopeEnum, SectionTypeEnum } from './section-registry';
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

// key: stable within (tenant, scope) — "default" for a scope's single layout,
// a slug for cms-page / custom standalone pages.
export const TemplateKey = z.string().min(1).max(255);

// Resolve-or-create a (scope, key) layout. `key` defaults to a scope's single
// "default" layout; `name` is humanized from the scope when omitted.
export const CreateTemplateInput = z.object({
  scope: ScopeEnum,
  key: TemplateKey.default('default'),
  name: z.string().min(1).max(255).optional(),
});
export type CreateTemplateInput = z.infer<typeof CreateTemplateInput>;

// "Customize this layout" — get-or-create then, if the layout is still empty,
// copy the code-defined DEFAULT_TEMPLATES[scope] rows into it (scopes without a
// code default just get an empty layout).
export const MaterializeTemplateInput = z.object({
  scope: ScopeEnum,
  key: TemplateKey.default('default'),
});
export type MaterializeTemplateInput = z.infer<typeof MaterializeTemplateInput>;

export const ListTemplatesQuery = z.object({
  scope: ScopeEnum.optional(),
});
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuery>;

export const CreateSectionInput = z.object({
  // Target layout. Address by `templateId` (preferred) or by `scope` (+ `key`,
  // default 'default') — e.g. scope 'home' / 'product' / 'collection'. The
  // service requires one of the two.
  templateId: Uuid.optional(),
  scope: ScopeEnum.optional(),
  key: TemplateKey.optional(),
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
  // Target layout — `templateId` (preferred) or `scope` (+ `key`, default
  // 'default'). The service requires one of the two.
  templateId: Uuid.optional(),
  scope: ScopeEnum.optional(),
  key: TemplateKey.optional(),
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
