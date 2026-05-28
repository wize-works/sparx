import type { ContentTypeDefinition } from '../types.js';

// Generic static page (About, Contact, landing pages, policy pages).
// Successor to the pre-cutover `pages` table; backfill maps each existing
// row into a `content_entries` row of type `page`.

export const pageType: ContentTypeDefinition = {
  key: 'page',
  name: 'Page',
  pluralName: 'Pages',
  description: 'Static page like About, Contact, or a landing page.',
  urlPattern: '/{slug}',
  icon: 'file-text',
  schema: {
    fields: [
      {
        key: 'title',
        type: 'text',
        label: 'Title',
        required: true,
        max: 255,
      },
      {
        key: 'body',
        type: 'rich_text',
        label: 'Body',
        required: true,
      },
      {
        key: 'excerpt',
        type: 'long_text',
        label: 'Excerpt',
        max: 500,
        helpText: 'Plain-text summary used in search results, feeds, and OG cards when no description is set.',
      },
      {
        key: 'featuredImage',
        type: 'asset',
        label: 'Featured image',
        accept: ['image/*'],
      },
    ],
  },
};
