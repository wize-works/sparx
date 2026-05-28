import type { ContentTypeDefinition } from '../types.js';
import { pageType } from './page.js';
import { blogPostType } from './blog-post.js';
import { moduleType } from './module.js';
import { featureType } from './feature.js';
import { faqItemType } from './faq-item.js';
import { editorialSectionType } from './editorial-section.js';

export { pageType, blogPostType, moduleType, featureType, faqItemType, editorialSectionType };

// Ordered: parents before children. The data migration that seeds
// content_types iterates this array in order so references in body
// (e.g. module → feature) resolve cleanly should the API ever choose to
// validate them eagerly.

export const BUILT_IN_CONTENT_TYPES: readonly ContentTypeDefinition[] = [
  pageType,
  blogPostType,
  featureType,
  faqItemType,
  editorialSectionType,
  moduleType,
];

export const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
