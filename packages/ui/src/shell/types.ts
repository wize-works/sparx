// Shell manifest contract. Pure types — no runtime, no React.
//
// Every Sparx module exports a single static ModuleManifest. The dashboard
// shell composes manifests to render the sidebar, breadcrumbs, ⌘K, and the
// ... menu. See docs/24-dashboard-shell.md §3 for the full spec.

import type { ComponentType, SVGProps } from 'react';
import type { SparxModule } from '../providers/module-provider';

// Lucide icons are functional components that accept SVGProps. The type is
// kept loose so any svg-bearing component is acceptable, including custom
// inline SVGs.
export type ModuleIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface ModuleSection {
  id: string;
  label: string;
  icon: ModuleIcon;
  href: string;
}

export interface ModuleAction {
  // Durable identifier. Stored in user_favorites.action_id. Renaming an
  // action's label is safe; changing its id orphans favorites — treat it
  // like a database column name.
  id: string;
  label: string;
  icon: ModuleIcon;
  href: string;
}

export interface ModuleEntityType {
  id: string;
  label: string;
  routePrefix: string;
}

// A module's static contribution to the dashboard shell. The shell never
// mutates this — it only reads.
export interface ModuleManifest {
  // Matches the SparxModule union; also drives the accent color through
  // ModuleProvider. 'platform' is reserved for the shell itself and is not
  // a valid manifest id.
  id: Exclude<SparxModule, 'platform'>;
  label: string;
  icon: ModuleIcon;
  // URL prefix the module owns. Usually `/${id}` but the Storefront module
  // is surfaced as `/sitebuilder` in the dashboard, so this is explicit.
  routePrefix: string;
  sections: ModuleSection[];
  actions: ModuleAction[];
  entityTypes: ModuleEntityType[];
}
