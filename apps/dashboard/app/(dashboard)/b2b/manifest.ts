// B2B / Wholesale module — stub manifest.
//
// TODO: migrate to packages/b2b/src/manifest.ts when that package exists.

import type { ModuleManifest } from '@sparx/ui/shell';
import { Building2 } from 'lucide-react';

export const b2bManifest: ModuleManifest = {
  id: 'b2b',
  label: 'B2B',
  icon: Building2,
  routePrefix: '/b2b',
  sections: [],
  actions: [],
  entityTypes: [],
};
