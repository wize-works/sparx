// Dashboard shell manifest for the CMS module.
//
// Imported by the dashboard via `@sparx/cms-editor/manifest` — keep this
// file dependency-light: types from @sparx/ui/shell, icons from
// lucide-react, nothing else. See docs/24-dashboard-shell.md §3.

import type { ModuleManifest } from '@sparx/ui/shell';
import {
  CornerUpRight,
  Database,
  FileText,
  Image as ImageIcon,
  Navigation,
  Tags,
  Upload,
  User,
  UserPlus,
  Webhook,
} from 'lucide-react';

export const cmsManifest: ModuleManifest = {
  id: 'cms',
  label: 'CMS',
  icon: FileText,
  routePrefix: '/cms',
  sections: [
    { id: 'pages', label: 'Pages', icon: FileText, href: '/cms/pages' },
    { id: 'types', label: 'Content types', icon: Database, href: '/cms/types' },
    { id: 'navigation', label: 'Navigation', icon: Navigation, href: '/cms/navigation' },
    { id: 'media', label: 'Media', icon: ImageIcon, href: '/cms/media' },
    { id: 'authors', label: 'Authors', icon: User, href: '/cms/authors' },
    { id: 'taxonomy', label: 'Taxonomy', icon: Tags, href: '/cms/taxonomy' },
    { id: 'redirects', label: 'Redirects', icon: CornerUpRight, href: '/cms/redirects' },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook, href: '/cms/webhooks' },
  ],
  actions: [
    { id: 'cms.media.upload', label: 'Upload media', icon: Upload, href: '/cms/media?upload=1' },
    { id: 'cms.author.create', label: 'Create author', icon: UserPlus, href: '/cms/authors/new' },
    {
      id: 'cms.redirect.create',
      label: 'Create redirect',
      icon: CornerUpRight,
      href: '/cms/redirects/new',
    },
  ],
  entityTypes: [
    { id: 'page', label: 'Page', routePrefix: '/cms', hasDetailView: true },
    // The content-TYPE definition is keyed by its `key` string, so the drawer
    // token `?drawer=content-type:<key>` resolves fine — the drawer shows the
    // type's identity + schema editor (custom) / read-only schema (built-in).
    // (Content-type ENTRIES still open full-page: that token can't yet carry
    // the typeKey + entryId pair. Tracked in [[content-entry-drawer-deferred]].)
    { id: 'content-type', label: 'Content type', routePrefix: '/cms/types', hasDetailView: true },
    { id: 'media', label: 'Media', routePrefix: '/cms/media', hasDetailView: true },
    { id: 'author', label: 'Author', routePrefix: '/cms/authors', hasDetailView: true },
    // Menus are keyed by location string, not UUID — the entity id for the
    // detail-view URL is the location (e.g. ?drawer=menu:header).
    { id: 'menu', label: 'Menu', routePrefix: '/cms/navigation', hasDetailView: true },
    // Taxonomies are keyed by `key` string, not UUID — entity id is the key.
    { id: 'taxonomy', label: 'Taxonomy', routePrefix: '/cms/taxonomy', hasDetailView: true },
    { id: 'redirect', label: 'Redirect', routePrefix: '/cms/redirects' },
  ],
};
