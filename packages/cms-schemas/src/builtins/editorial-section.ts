import type { ContentTypeDefinition } from '../types';

// Long-form marketing section embedded into a parent page (apps/web has
// these as hand-coded components today: mcp-spotlight, b2b-spotlight,
// developer-section, etc.). The `key` field is the stable identifier the
// consuming page uses to fetch the right section — slug stays NULL.

export const editorialSectionType: ContentTypeDefinition = {
  key: 'editorial_section',
  name: 'Editorial section',
  pluralName: 'Editorial sections',
  description: 'Embeddable long-form marketing block — spotlight, callout, or pitch panel.',
  icon: 'panel-top',
  schema: {
    fields: [
      {
        key: 'key',
        type: 'text',
        label: 'Section key',
        required: true,
        max: 60,
        helpText: 'Stable identifier the consuming page references, e.g. "mcp_spotlight".',
      },
      {
        key: 'eyebrow',
        type: 'text',
        label: 'Eyebrow',
        max: 80,
      },
      {
        key: 'headline',
        type: 'text',
        label: 'Headline',
        required: true,
        max: 200,
      },
      {
        key: 'body',
        type: 'rich_text',
        label: 'Body',
        required: true,
      },
      {
        key: 'ctaLabel',
        type: 'text',
        label: 'CTA label',
        max: 60,
      },
      {
        key: 'ctaUrl',
        type: 'url',
        label: 'CTA URL',
      },
      {
        key: 'accentImage',
        type: 'asset',
        label: 'Accent image',
        accept: ['image/*'],
      },
    ],
  },
};
