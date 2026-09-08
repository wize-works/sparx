// What happens to the things she writes: pages, files, and old addresses.

import type { WebhookEventDef } from './types';

export const CONTENT_EVENTS: readonly WebhookEventDef[] = [
  {
    key: 'content.entry.published',
    label: 'Content published',
    description: 'Something you write goes live on your site.',
    group: 'Content',
  },
  {
    key: 'content.entry.unpublished',
    label: 'Content taken down',
    description: 'A live page is unpublished and becomes a private draft again.',
    group: 'Content',
  },
  {
    key: 'content.entry.scheduled',
    label: 'Content scheduled',
    description: 'A page is set to publish itself at a future time.',
    group: 'Content',
  },
  {
    key: 'content.entry.created',
    label: 'Content created',
    description: 'A brand-new draft is started, before it is published.',
    group: 'Content',
  },
  {
    key: 'content.entry.updated',
    label: 'Content edited',
    description: 'Any change is saved to an existing page, draft or live.',
    group: 'Content',
  },
  {
    key: 'content.entry.deleted',
    label: 'Content deleted',
    description: 'A page is removed for good.',
    group: 'Content',
  },
  {
    key: 'media.uploaded',
    label: 'File uploaded',
    description: 'An image, video or file is added to your media library.',
    group: 'Files',
  },
  {
    key: 'media.processed',
    label: 'File ready',
    description: 'An uploaded file finishes processing and is ready to use.',
    group: 'Files',
  },
  {
    key: 'redirect.added',
    label: 'Redirect added',
    description: 'A rule is set up to send an old web address to a new one.',
    group: 'Redirects',
  },
  {
    key: 'redirect.changed',
    label: 'Redirect changed',
    description: 'An existing rule is repointed at a different address.',
    group: 'Redirects',
  },
  {
    key: 'redirect.removed',
    label: 'Redirect removed',
    description: 'A redirect rule is deleted.',
    group: 'Redirects',
  },
];
