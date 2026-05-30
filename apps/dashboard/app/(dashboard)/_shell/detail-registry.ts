import { moduleManifests } from './registry';

// Client-safe manifest helpers for the detail-view system.
//
// IMPORTANT: this module is imported by client components (the detail-panel
// chrome, entity row links). It must NOT pull in any server-only detail
// content components — those live in `detail-slot.tsx`, a server-only module
// the parallel `@detail` route renders. Mixing the two is what dragged
// `next/headers` (via `_content.tsx` → `@sparx/auth`) into the client bundle.
//
// Adding a new entity to the detail-view system is a 3-step change:
//   1. Extract the page body into `<entity-route>/_content.tsx` so it
//      renders without full-page chrome.
//   2. Register the server component in `detail-slot.tsx`.
//   3. Set `hasDetailView: true` on the matching manifest entityType.

// Parses a `type:id` token (the value of `?drawer=` / `?modal=`) into its
// parts. Returns null for malformed tokens (no colon, empty type, empty id).
// Pure and dependency-free so both the server `@detail` slot and the client
// panel chrome share one definition.
export function parseDetailToken(
  raw: string | null | undefined
): { typeId: string; entityId: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf(':');
  if (idx < 1 || idx === raw.length - 1) return null;
  return { typeId: raw.slice(0, idx), entityId: raw.slice(idx + 1) };
}

// Finds the manifest entity type by id. Used by the detail panel chrome to
// resolve the entity's label, routePrefix, etc.
export function findEntityType(typeId: string) {
  for (const manifest of moduleManifests) {
    const et = manifest.entityTypes.find((e) => e.id === typeId);
    if (et) return { entityType: et, manifest };
  }
  return undefined;
}

// Whether an entity type opts into the drawer/modal detail view. Driven by
// the manifest flag rather than the server registry so client code can ask
// without importing server components.
export function hasDetailView(typeId: string): boolean {
  return findEntityType(typeId)?.entityType.hasDetailView === true;
}
