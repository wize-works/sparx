// Storefront / Sitebuilder module — stub manifest.
//
// TODO: migrate to packages/storefront/src/manifest.ts when that package exists.

import type { ModuleManifest } from '@sparx/ui/shell';
import { LayoutTemplate } from 'lucide-react';

export const sitebuilderManifest: ModuleManifest = {
  id: 'storefront',
  label: 'Sitebuilder',
  icon: LayoutTemplate,
  routePrefix: '/sitebuilder',
  sections: [],
  actions: [],
  entityTypes: [],
};
