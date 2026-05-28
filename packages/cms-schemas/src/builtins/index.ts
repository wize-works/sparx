import type { ContentTypeDefinition } from '../types';
import { pageType } from './page';
import { blogPostType } from './blog-post';
import { moduleType } from './module';
import { featureType } from './feature';
import { faqItemType } from './faq-item';
import { editorialSectionType } from './editorial-section';

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
