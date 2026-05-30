// Dropship module — stub manifest.
//
// TODO: migrate to packages/dropship/src/manifest.ts when that package exists.

import type { ModuleManifest } from '@sparx/ui/shell';
import { Truck } from 'lucide-react';

export const dropshipManifest: ModuleManifest = {
  id: 'dropship',
  label: 'Dropship',
  icon: Truck,
  routePrefix: '/dropship',
  sections: [],
  actions: [],
  entityTypes: [],
};
