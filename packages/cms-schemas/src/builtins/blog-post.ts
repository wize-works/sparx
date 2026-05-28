import type { ContentTypeDefinition } from '../types.js';

// Authored blog post (docs/12-cms-prd.md §5.2). Author, categories, and
// tags live OUTSIDE body — on the content_entries.author_id column and via
// the taxonomy / taxonomy_terms tables respectively.

export const blogPostType: ContentTypeDefinition = {
  key: 'blog_post',
  name: 'Blog post',
  pluralName: 'Blog posts',
  description: 'Authored article with excerpt, featured image, and rich body.',
  urlPattern: '/blog/{slug}',
  icon: 'newspaper',
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
        key: 'excerpt',
        type: 'long_text',
        label: 'Excerpt',
        required: true,
        max: 500,
        helpText: 'Shown on index pages, in RSS, and in search results.',
      },
      {
        key: 'body',
        type: 'rich_text',
        label: 'Body',
        required: true,
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
