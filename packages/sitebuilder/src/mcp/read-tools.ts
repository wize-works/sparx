// Read-only Site Builder MCP tools. No confirmation; scope read:storefront.

import { z } from 'zod';
import { ScopeEnum, TemplateKey } from '@sparx/sitebuilder-schemas';
import { themeService, sectionService, publishService } from '../services/index';
import type { AnyMcpTool } from './registry';

const NoArgs = z.object({});
const ScopeArg = z.object({ scope: ScopeEnum, key: TemplateKey.default('default') });
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
      'List a scoped layout’s sections in render order. `scope` is home | product | collection | cms-page | custom; `key` defaults to "default" (use a slug for a custom/cms page).',
    scope: 'read:storefront',
    input: ScopeArg,
    confirmation: false,
    run: (ctx, input) => {
      const { scope, key } = input as z.infer<typeof ScopeArg>;
      return sectionService.listForScope(ctx, scope, key);
    },
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
