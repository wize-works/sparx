// AI / MCP module — stub manifest.
//
// TODO: migrate to packages/ai/src/manifest.ts when that package exists.

import type { ModuleManifest } from '@sparx/ui/shell';
import { Sparkles } from 'lucide-react';

export const aiManifest: ModuleManifest = {
  id: 'ai',
  label: 'AI',
  icon: Sparkles,
  routePrefix: '/ai',
  sections: [],
  actions: [],
  entityTypes: [],
};
