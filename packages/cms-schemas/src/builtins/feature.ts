import type { ContentTypeDefinition } from '../types.js';

// One feature card — the {number, title, body} shape from
// apps/web/lib/modules.ts (`ModuleFeature`). Non-routable: slug stays NULL.
// Features are linked into a `module` entry's `features` reference list and
// editable individually from the CMS sidebar.

export const featureType: ContentTypeDefinition = {
  key: 'feature',
  name: 'Feature',
  pluralName: 'Features',
  description: 'A single numbered feature card linked from a module page or other section.',
  icon: 'sparkles',
  schema: {
    fields: [
      {
        key: 'number',
        type: 'text',
        label: 'Number',
        required: true,
        max: 4,
        helpText: 'Two-digit ordinal, e.g. "01".',
      },
      {
        key: 'title',
        type: 'text',
        label: 'Title',
        required: true,
        max: 120,
      },
      {
        key: 'body',
        type: 'long_text',
        label: 'Body',
        required: true,
        max: 600,
      },
      {
        key: 'icon',
        type: 'text',
        label: 'Icon',
        max: 40,
        helpText: 'Lucide icon name (optional).',
      },
    ],
  },
};
