// Dashboard shell manifest for the Site Builder (storefront) module.
//
// Imported by the dashboard via `@sparx/sitebuilder/manifest` — keep this file
// dependency-light: types from @sparx/ui/shell, icons from lucide-react,
// nothing else. See docs/24-dashboard-shell.md §3 for the contract.

import type { ModuleManifest } from '@sparx/ui/shell';
import {
  FileText,
  Fingerprint,
  Home,
  Image,
  Layers,
  LayoutTemplate,
  Package,
  PanelTop,
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
    // Brand is the tenant-level identity foundation (docs/30 §6) — first in the
    // rail, above the presentation layers (theme/design) that read from it.
    { id: 'brand', label: 'Brand', icon: Fingerprint, href: '/sitebuilder/brand' },
    // Theme switching + presentation tokens (the old "Themes" gallery folded in
    // here — theme selection lives in the Design/Theme scope). Route stays
    // /sitebuilder/design until the v2-native theme pane lands (Phase 2 §2.3).
    { id: 'design', label: 'Theme', icon: Palette, href: '/sitebuilder/design' },
    // Layouts — the scoped page layouts (Phase 3). Home is the storefront
    // homepage; Products/Collections are the bound layouts every product/
    // collection page renders through; Pages are standalone section-based slugs.
    { id: 'homepage', label: 'Homepage', icon: Home, href: '/sitebuilder/homepage' },
    { id: 'products', label: 'Product pages', icon: Package, href: '/sitebuilder/products' },
    {
      id: 'collections',
      label: 'Collection pages',
      icon: Layers,
      href: '/sitebuilder/collections',
    },
    { id: 'pages', label: 'Pages', icon: FileText, href: '/sitebuilder/pages' },
    {
      id: 'navigation',
      label: 'Header & footer',
      icon: PanelTop,
      href: '/sitebuilder/navigation',
    },
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
