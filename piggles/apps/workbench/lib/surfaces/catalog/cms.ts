// Content — everything you publish that isn't a product.

import {
  faDatabase,
  faFileText,
  faImage,
  faLanguage,
  faScaleBalanced,
  faTags,
  faUpRight,
  faUpload,
  faUser,
  faWebhook,
} from '@fortawesome/pro-solid-svg-icons';
import type { SurfaceDefinition } from '../registry';
import { ContentListSurface } from '../../../surfaces/cms/content-list';
import { ContentDetailSurface } from '../../../surfaces/cms/content-detail';
import { MediaListSurface } from '../../../surfaces/cms/media-list';
import { MediaDetailSurface } from '../../../surfaces/cms/media-detail';
import { AuthorsListSurface } from '../../../surfaces/cms/authors-list';
import { AuthorDetailSurface } from '../../../surfaces/cms/author-detail';
import { TaxonomyListSurface } from '../../../surfaces/cms/taxonomy-list';
import { TaxonomyDetailSurface } from '../../../surfaces/cms/taxonomy-detail';
import { ContentTypesListSurface } from '../../../surfaces/cms/content-types-list';
import { ContentTypeDetailSurface } from '../../../surfaces/cms/content-type-detail';
import { RedirectsListSurface } from '../../../surfaces/cms/redirects-list';
import { RedirectsImportSurface } from '../../../surfaces/cms/redirects-import';
import { TranslationsListSurface } from '../../../surfaces/cms/translations-list';
import { TranslationDetailSurface } from '../../../surfaces/cms/translation-detail';
import { LegalListSurface } from '../../../surfaces/cms/legal-list';
import { WebhooksListSurface } from '../../../surfaces/cms/webhooks-list';
import { WebhookDetailSurface } from '../../../surfaces/cms/webhook-detail';

export const CMS_SURFACES: SurfaceDefinition[] = [
  {
    key: 'cms.content.list',
    title: 'Content',
    module: 'cms',
    icon: faFileText,
    order: 1,
    keywords: ['pages', 'posts', 'articles', 'blog', 'news'],
    component: ContentListSurface,
    createSurface: 'cms.content.detail',
    createLabel: 'Write something new',
  },
  {
    key: 'cms.content.detail',
    title: 'Content',
    module: 'cms',
    icon: faFileText,
    component: ContentDetailSurface,
    // Reachable from the list and the nav panel's `+`, not a launcher entry of
    // its own: opening "some content" with nothing in mind is not a thing anyone
    // wants, and writing something new is already offered where content lives.
    listed: false,
  },

  /* ── Library ───────────────────────────────────────────────────────────── */
  {
    key: 'cms.media.list',
    title: 'Media',
    module: 'cms',
    icon: faImage,
    section: 'Library',
    order: 10,
    keywords: ['images', 'photos', 'files', 'uploads', 'video', 'audio', 'library', 'assets'],
    component: MediaListSurface,
    // No createSurface `+`: you make an asset by UPLOADING a file (a native
    // picker in the list toolbar), not by opening a blank detail pane.
  },
  {
    key: 'cms.media.detail',
    title: 'Media',
    module: 'cms',
    icon: faImage,
    component: MediaDetailSurface,
    listed: false,
  },
  {
    key: 'cms.authors.list',
    title: 'Authors',
    module: 'cms',
    icon: faUser,
    section: 'Library',
    order: 11,
    keywords: ['writers', 'byline', 'contributors', 'people', 'bio'],
    component: AuthorsListSurface,
    createSurface: 'cms.authors.detail',
    createLabel: 'Add an author',
  },
  {
    key: 'cms.authors.detail',
    title: 'Author',
    module: 'cms',
    icon: faUser,
    component: AuthorDetailSurface,
    listed: false,
  },
  {
    key: 'cms.taxonomy.list',
    title: 'Tags & topics',
    module: 'cms',
    icon: faTags,
    section: 'Library',
    order: 12,
    keywords: ['taxonomy', 'categories', 'labels', 'tags', 'topics', 'terms', 'vocabulary'],
    component: TaxonomyListSurface,
    createSurface: 'cms.taxonomy.detail',
    createLabel: 'New way to file content',
  },
  {
    key: 'cms.taxonomy.detail',
    title: 'Tags & topics',
    module: 'cms',
    icon: faTags,
    component: TaxonomyDetailSurface,
    listed: false,
  },

  /* ── Structure ─────────────────────────────────────────────────────────── */
  {
    key: 'cms.types.list',
    title: 'Content types',
    module: 'cms',
    icon: faDatabase,
    section: 'Structure',
    order: 20,
    keywords: ['fields', 'schema', 'custom', 'model', 'content type'],
    component: ContentTypesListSurface,
    createSurface: 'cms.types.detail',
    createLabel: 'New content type',
  },
  {
    key: 'cms.types.detail',
    title: 'Content type',
    module: 'cms',
    icon: faDatabase,
    component: ContentTypeDetailSurface,
    listed: false,
  },
  {
    key: 'cms.redirects.list',
    title: 'Redirects',
    module: 'cms',
    icon: faUpRight,
    section: 'Structure',
    order: 21,
    keywords: ['301', '302', 'moved', 'old links', 'broken', 'url'],
    component: RedirectsListSurface,
  },
  {
    key: 'cms.redirects.import',
    title: 'Import redirects',
    module: 'cms',
    icon: faUpload,
    component: RedirectsImportSurface,
    // Reachable only from the list's Bulk import button (target: 'beside').
    listed: false,
  },

  /* ── Localization ──────────────────────────────────────────────────────── */
  {
    key: 'cms.translations.list',
    title: 'Translations',
    module: 'cms',
    icon: faLanguage,
    section: 'Localization',
    order: 22,
    keywords: [
      'translation',
      'translations',
      'localization',
      'localisation',
      'locale',
      'language',
      'languages',
      'multilingual',
      'i18n',
    ],
    component: TranslationsListSurface,
    // Products are created in commerce, not here — no `+`, no create modal.
  },
  {
    key: 'cms.translations.detail',
    title: 'Translations',
    module: 'cms',
    icon: faLanguage,
    component: TranslationDetailSurface,
    listed: false,
  },

  /* ── Setup ─────────────────────────────────────────────────────────────── */
  {
    key: 'cms.legal.list',
    title: 'Legal pages',
    module: 'cms',
    icon: faScaleBalanced,
    section: 'Setup',
    order: 30,
    keywords: ['privacy', 'terms', 'policy', 'cookies', 'returns policy', 'gdpr', 'compliance'],
    component: LegalListSurface,
    // No detail key + no createSurface: each checklist row instantiates its own
    // specific document, and body editing hands off to cms.content.detail.
  },
  {
    key: 'cms.webhooks.list',
    title: 'Webhooks',
    module: 'cms',
    icon: faWebhook,
    section: 'Setup',
    order: 31,
    keywords: ['notify', 'api', 'developer', 'integration', 'webhook'],
    component: WebhooksListSurface,
    createSurface: 'cms.webhooks.detail',
    createLabel: 'Set one up',
  },
  {
    key: 'cms.webhooks.detail',
    title: 'Webhook',
    module: 'cms',
    icon: faWebhook,
    component: WebhookDetailSurface,
    listed: false,
  },
];
