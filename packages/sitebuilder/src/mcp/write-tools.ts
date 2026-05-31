// Write Site Builder MCP tools. Go-live actions (publish/rollback/schedule)
// are confirmation-gated; scope write:storefront.

import { z } from 'zod';
import {
  CreateSectionInput,
  PublishInput,
  ReorderSectionsInput,
  RollbackInput,
  ScheduleInput,
  SelectThemeInput,
  UpdateSettingsInput,
  UpsertLayoutInput,
  Uuid,
} from '@sparx/sitebuilder-schemas';
import {
  themeService,
  sectionService,
  layoutService,
  publishService,
  scheduleService,
} from '../services/index';
import type { AnyMcpTool } from './registry';

const UpdateSectionTool = z.object({
  sectionId: Uuid,
  config: z.record(z.string(), z.unknown()).optional(),
  visible: z.boolean().optional(),
});
const RemoveSectionTool = z.object({ sectionId: Uuid });

export const writeTools: AnyMcpTool[] = [
  {
    name: 'select_theme',
    description: 'Switch the storefront to a different theme (draft change — publish to go live).',
    scope: 'write:storefront',
    input: SelectThemeInput,
    confirmation: false,
    run: (ctx, input) => themeService.selectTheme(ctx, input),
  },
  {
    name: 'update_site_settings',
    description:
      'Update the draft theme settings (colors per light/dark, fonts, layout, custom CSS) and/or the appearance policy.',
    scope: 'write:storefront',
    input: UpdateSettingsInput,
    confirmation: false,
    run: (ctx, input) => themeService.updateSettings(ctx, input),
  },
  {
    name: 'add_section',
    description:
      'Add a section (hero, featured-products, testimonials, …) to a layout draft. Target the layout by `templateId`, or by `scope` (home | product | collection | cms-page | custom) + optional `key`.',
    scope: 'write:storefront',
    input: CreateSectionInput,
    confirmation: false,
    run: (ctx, input) => sectionService.create(ctx, input),
  },
  {
    name: 'update_section',
    description: "Update a section's config and/or visibility.",
    scope: 'write:storefront',
    input: UpdateSectionTool,
    confirmation: false,
    run: (ctx, input) => {
      const { sectionId, ...rest } = input as z.infer<typeof UpdateSectionTool>;
      return sectionService.update(ctx, sectionId, rest);
    },
  },
  {
    name: 'reorder_sections',
    description:
      'Reorder a layout’s sections by supplying the section ids in the desired order. Target the layout by `templateId`, or by `scope` (+ optional `key`).',
    scope: 'write:storefront',
    input: ReorderSectionsInput,
    confirmation: false,
    run: (ctx, input) => sectionService.reorder(ctx, input),
  },
  {
    name: 'remove_section',
    description: 'Delete a section from a page draft.',
    scope: 'write:storefront',
    input: RemoveSectionTool,
    confirmation: true,
    run: (ctx, input) =>
      sectionService.remove(ctx, (input as z.infer<typeof RemoveSectionTool>).sectionId),
  },
  {
    name: 'upsert_layout',
    description:
      'Configure a header / footer / announcement slot (optionally linking a navigation menu).',
    scope: 'write:storefront',
    input: UpsertLayoutInput,
    confirmation: false,
    run: (ctx, input) => layoutService.upsert(ctx, input),
  },
  {
    name: 'publish_site',
    description: 'Publish the current draft live to the storefront.',
    scope: 'write:storefront',
    input: PublishInput,
    confirmation: true,
    run: (ctx, input) => publishService.publishNow(ctx, input),
  },
  {
    name: 'rollback_site',
    description: 'Roll the storefront back to a prior published version (creates a new version).',
    scope: 'write:storefront',
    input: RollbackInput,
    confirmation: true,
    run: (ctx, input) => publishService.rollback(ctx, input),
  },
  {
    name: 'schedule_publish',
    description: 'Schedule the current draft to publish at a future time.',
    scope: 'write:storefront',
    input: ScheduleInput,
    confirmation: true,
    run: (ctx, input) => scheduleService.schedule(ctx, input),
  },
];
