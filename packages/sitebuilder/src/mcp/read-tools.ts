// Read-only Site Builder MCP tools. No confirmation; scope read:storefront.

import { z } from 'zod';
import { themeService, sectionService, publishService } from '../services/index';
import type { AnyMcpTool } from './registry';

const NoArgs = z.object({});
const PageArg = z.object({ pageKey: z.string().min(1).max(255).default('home') });
const ListVersionsArgs = z.object({
  take: z.number().int().min(1).max(200).optional(),
  skip: z.number().int().min(0).optional(),
});

export const readTools: AnyMcpTool[] = [
  {
    name: 'list_themes',
    description:
      'List the available storefront themes (Apex, Industrial, Drift, Market, Fleet, Drop) with their settings schema and category.',
    scope: 'read:storefront',
    input: NoArgs,
    confirmation: false,
    run: () => Promise.resolve(themeService.listThemes()),
  },
  {
    name: 'get_site_config',
    description:
      'Get the current Site Builder draft config: selected theme, appearance policy (light/dark), and settings overlay.',
    scope: 'read:storefront',
    input: NoArgs,
    confirmation: false,
    run: (ctx) => themeService.getConfig(ctx),
  },
  {
    name: 'get_sections',
    description:
      'List the section composition for a page (pageKey "home" or a CMS page slug), in render order.',
    scope: 'read:storefront',
    input: PageArg,
    confirmation: false,
    run: (ctx, input) => sectionService.list(ctx, (input as z.infer<typeof PageArg>).pageKey),
  },
  {
    name: 'list_site_versions',
    description: 'List published Site Builder versions (newest first) for history and rollback.',
    scope: 'read:storefront',
    input: ListVersionsArgs,
    confirmation: false,
    run: (ctx, input) =>
      publishService.listVersions(ctx, input as z.infer<typeof ListVersionsArgs>),
  },
  {
    name: 'get_published_site',
    description:
      'Get the currently-published storefront snapshot: theme, appearance policy, compiled tokens, sections, and layout.',
    scope: 'read:storefront',
    input: NoArgs,
    confirmation: false,
    run: (ctx) => publishService.getPublishedSnapshot(ctx),
  },
];
