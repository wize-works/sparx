// Email module — stub manifest.
//
// TODO: migrate to packages/email-module/src/manifest.ts (or similar — note
// that packages/email is sending infrastructure, not the module package)
// when that package exists.

import type { ModuleManifest } from '@sparx/ui/shell';
import { Mail } from 'lucide-react';

export const emailManifest: ModuleManifest = {
  id: 'email',
  label: 'Email',
  icon: Mail,
  routePrefix: '/email',
  sections: [],
  actions: [],
  entityTypes: [],
};
