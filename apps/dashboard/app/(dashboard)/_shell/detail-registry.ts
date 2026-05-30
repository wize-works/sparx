import type * as React from 'react';
import { moduleManifests } from './registry';

// Maps a manifest entity type id → lazy-loaded content component.
//
// Each entry uses React.lazy / dynamic import so the detail UI isn't
// bundled into the shell's initial chunk. The shell loads exactly the
// content component for whatever `?drawer=type:id` / `?modal=type:id` the
// URL currently carries.
//
// Adding a new entity to the detail-view system is a 3-step change:
//   1. Extract the page body into `<entity-route>/_content.tsx` so it
//      renders without full-page chrome.
//   2. Register the lazy import here.
//   3. Set `hasDetailView: true` on the matching manifest entityType.

interface LoaderResult {
  default: React.ComponentType<{ id: string }>;
}
type DetailComponentLoader = () => Promise<LoaderResult>;

// Each loader returns a default export of `React.ComponentType<{ id: string }>`.
// Wrap named exports in a tiny adapter — see CMS page below.
export const detailComponentLoaders: Record<string, DetailComponentLoader> = {
  page: async () => {
    const mod = await import('../cms/[id]/_content');
    return { default: mod.CmsPageDetailContent };
  },
};

export function hasDetailComponent(typeId: string): boolean {
  return typeId in detailComponentLoaders;
}

export function getDetailComponentLoader(typeId: string): DetailComponentLoader | undefined {
  return detailComponentLoaders[typeId];
}

// Finds the manifest entity type by id. Used by the detail panel to
// resolve the entity's label, routePrefix, etc.
export function findEntityType(typeId: string) {
  for (const manifest of moduleManifests) {
    const et = manifest.entityTypes.find((e) => e.id === typeId);
    if (et) return { entityType: et, manifest };
  }
  return undefined;
}
