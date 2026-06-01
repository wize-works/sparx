// Write-input schemas shared by the service layer, REST routes, and MCP tools.
// Every mutation validates against one of these before touching Prisma.

import { z } from 'zod';
import { AppearancePolicy, LayoutSlot, OptionalUuid, ThemeKey, Uuid } from './common';
import { TargetId } from './layout-targets';
import { SectionTypeEnum } from './section-registry';
import { PresentationOverlay, SiteSettings } from './site-settings';

export const SelectThemeInput = z.object({
  themeKey: ThemeKey,
});
export type SelectThemeInput = z.infer<typeof SelectThemeInput>;

export const UpdateSettingsInput = z.object({
  settings: SiteSettings.optional(),
  appearancePolicy: AppearancePolicy.optional(),
});
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;

// key: stable within (tenant, targetId) — "default" for a target's single
// layout, a slug for cms:content-page standalone pages.
export const LayoutKey = z.string().min(1).max(255);

// Resolve-or-create a (targetId, key) page layout. `key` defaults to a target's
// single "default" layout; `name` is humanized from the target when omitted.
export const CreatePageLayoutInput = z.object({
  targetId: TargetId,
  key: LayoutKey.default('default'),
  name: z.string().min(1).max(255).optional(),
});
export type CreatePageLayoutInput = z.infer<typeof CreatePageLayoutInput>;

// "Customize this layout" — get-or-create then, if the layout is still empty,
// copy the code-defined DEFAULT_TEMPLATES[targetId] rows into it (targets without
// a code default just get an empty layout).
export const MaterializePageLayoutInput = z.object({
  targetId: TargetId,
  key: LayoutKey.default('default'),
});
export type MaterializePageLayoutInput = z.infer<typeof MaterializePageLayoutInput>;

export const ListPageLayoutsQuery = z.object({
  targetId: TargetId.optional(),
});
export type ListPageLayoutsQuery = z.infer<typeof ListPageLayoutsQuery>;

export const CreateSectionInput = z.object({
  // Target layout. Address by `pageLayoutId` (preferred) or by `targetId` (+
  // `key`, default 'default') — e.g. 'commerce:product' / 'site:home'. The
  // service requires one of the two.
  pageLayoutId: Uuid.optional(),
  targetId: TargetId.optional(),
  key: LayoutKey.optional(),
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
  // Target layout — `pageLayoutId` (preferred) or `targetId` (+ `key`, default
  // 'default'). The service requires one of the two.
  pageLayoutId: Uuid.optional(),
  targetId: TargetId.optional(),
  key: LayoutKey.optional(),
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
  // Optional saved theme to apply to the draft before this scheduled publish
  // snapshots — seasonal/holiday theme swaps (docs/36 Brand+Theme tier).
  themeId: Uuid.optional(),
});
export type ScheduleInput = z.infer<typeof ScheduleInput>;

// ── Saved themes (docs/36 Brand+Theme tier) ─────────────────────────────────
// A tenant's NAMED presentation variant — the merchant's own library, distinct
// from the read-only platform presets. `presentation` is the v2 overlay;
// `basePresetKey` is the preset it layers on.
export const SavedThemeName = z.string().min(1).max(120);

export const CreateSavedThemeInput = z.object({
  name: SavedThemeName,
  basePresetKey: ThemeKey,
  presentation: PresentationOverlay.default({}),
});
export type CreateSavedThemeInput = z.infer<typeof CreateSavedThemeInput>;

export const UpdateSavedThemeInput = z.object({
  name: SavedThemeName.optional(),
  presentation: PresentationOverlay.optional(),
});
export type UpdateSavedThemeInput = z.infer<typeof UpdateSavedThemeInput>;
