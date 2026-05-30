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
  Menu,
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
    { id: 'types', label: 'Content types', icon: Database, href: '/cms/types' },
    { id: 'media', label: 'Media', icon: ImageIcon, href: '/cms/media' },
    { id: 'authors', label: 'Authors', icon: User, href: '/cms/authors' },
    { id: 'navigation', label: 'Navigation', icon: Menu, href: '/cms/navigation' },
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
    // Content-type entries (any type other than 'page') open full-page only —
    // the drawer URL convention `?drawer=type:id` can't yet carry the
    // typeKey + entryId pair. Tracked in [[content-entry-drawer-deferred]].
    { id: 'content-type', label: 'Content type', routePrefix: '/cms/types' },
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
