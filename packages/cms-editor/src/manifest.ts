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
    // CMS pages get drawer/modal rendering as the first proof of the
    // shell's detail-view path. Other types add `hasDetailView: true` as
    // their _content.tsx + detail-registry entries land.
    { id: 'page', label: 'Page', routePrefix: '/cms', hasDetailView: true },
    { id: 'content-type', label: 'Content type', routePrefix: '/cms/types' },
    { id: 'media', label: 'Media', routePrefix: '/cms/media' },
    { id: 'author', label: 'Author', routePrefix: '/cms/authors' },
    { id: 'menu', label: 'Menu', routePrefix: '/cms/navigation' },
    { id: 'redirect', label: 'Redirect', routePrefix: '/cms/redirects' },
  ],
};
