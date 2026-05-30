// Dashboard shell manifest for the Site Builder (storefront) module.
//
// Imported by the dashboard via `@sparx/sitebuilder/manifest` — keep this file
// dependency-light: types from @sparx/ui/shell, icons from lucide-react,
// nothing else. See docs/24-dashboard-shell.md §3 for the contract.

import type { ModuleManifest } from '@sparx/ui/shell';
import {
  FileText,
  Home,
  Image,
  LayoutTemplate,
  Navigation,
  Palette,
  Plus,
  Rocket,
} from 'lucide-react';

export const sitebuilderManifest: ModuleManifest = {
  id: 'storefront',
  label: 'Site Builder',
  icon: LayoutTemplate,
  routePrefix: '/sitebuilder',
  sections: [
    { id: 'design', label: 'Design', icon: Palette, href: '/sitebuilder/design' },
    { id: 'themes', label: 'Themes', icon: LayoutTemplate, href: '/sitebuilder/themes' },
    { id: 'homepage', label: 'Homepage', icon: Home, href: '/sitebuilder/homepage' },
    { id: 'pages', label: 'Pages', icon: FileText, href: '/sitebuilder/pages' },
    { id: 'navigation', label: 'Navigation', icon: Navigation, href: '/sitebuilder/navigation' },
    { id: 'publishing', label: 'Publishing', icon: Rocket, href: '/sitebuilder/publishing' },
  ],
  actions: [
    {
      id: 'sitebuilder.page.create',
      label: 'Create page',
      icon: Plus,
      href: '/sitebuilder/pages/new',
    },
    {
      id: 'sitebuilder.media.open',
      label: 'Open media library',
      icon: Image,
      href: '/cms/media',
    },
  ],
  entityTypes: [
    { id: 'page', label: 'Page', routePrefix: '/sitebuilder/pages', hasDetailView: true },
  ],
};
