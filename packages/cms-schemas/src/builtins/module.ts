import type { ContentTypeDefinition } from '../types.js';

// Marketing module page (apps/web `ModuleMeta`). One entry per Sparx
// product module (storefront, commerce, cms, …). `slug` equals the
// moduleKey, which doubles as the URL segment (/storefront, /cms, …) and
// as the ModuleProvider theme key.
//
// `features` is a reference list to `feature` entries so a single feature
// can be edited once and (later) reused across multiple module pages.

export const moduleType: ContentTypeDefinition = {
  key: 'module',
  name: 'Module',
  pluralName: 'Modules',
  description: 'Marketing page for one Sparx product module.',
  urlPattern: '/{slug}',
  icon: 'layout-grid',
  schema: {
    fields: [
      {
        key: 'label',
        type: 'text',
        label: 'Eyebrow label',
        required: true,
        max: 60,
        helpText: 'Short chip above the headline, e.g. "AI · MCP".',
      },
      {
        key: 'moduleKey',
        type: 'enum',
        label: 'Module key',
        required: true,
        options: [
          { value: 'storefront', label: 'Storefront' },
          { value: 'commerce', label: 'Commerce' },
          { value: 'cms', label: 'CMS' },
          { value: 'crm', label: 'CRM' },
          { value: 'email', label: 'Email' },
          { value: 'b2b', label: 'B2B' },
          { value: 'ai', label: 'AI · MCP' },
          { value: 'dropship', label: 'Dropship' },
        ],
        helpText: 'Drives ModuleProvider theme color and the marketing URL slug.',
      },
      {
        key: 'headlinePrimary',
        type: 'text',
        label: 'Headline (primary)',
        required: true,
        max: 120,
      },
      {
        key: 'headlineSecondary',
        type: 'text',
        label: 'Headline (secondary)',
        required: true,
        max: 120,
      },
      {
        key: 'title',
        type: 'text',
        label: 'Page title',
        required: true,
        max: 120,
        helpText: 'Used in <title> and OG cards.',
      },
      {
        key: 'description',
        type: 'long_text',
        label: 'Meta description',
        required: true,
        max: 280,
      },
      {
        key: 'lede',
        type: 'long_text',
        label: 'Hero lede',
        required: true,
        max: 600,
      },
      {
        key: 'features',
        type: 'reference',
        label: 'Features',
        to: 'feature',
        multiple: true,
        min: 1,
        max: 12,
      },
      {
        key: 'pricing',
        type: 'object',
        label: 'Pricing',
        required: true,
        fields: [
          {
            key: 'price',
            type: 'text',
            label: 'Price',
            required: true,
            max: 20,
          },
          {
            key: 'period',
            type: 'text',
            label: 'Period',
            required: true,
            max: 20,
          },
          {
            key: 'modifier',
            type: 'enum',
            label: 'Modifier',
            required: true,
            options: [
              { value: 'standalone', label: 'Standalone' },
              { value: 'additive', label: 'Additive (+)' },
            ],
            helpText: 'Standalone for modules that can run alone; additive for modules that activate on top of Storefront.',
          },
          {
            key: 'bundleNote',
            type: 'long_text',
            label: 'Bundle note',
            required: true,
            max: 600,
          },
        ],
      },
      {
        key: 'marketingDomain',
        type: 'url',
        label: 'Marketing domain',
        helpText: 'Optional dedicated site for this module, e.g. sparxcms.com.',
      },
    ],
  },
};
