// Server-side read of a tenant's published Site Builder snapshot.
//
// `GET /v1/public/storefront/site?tenant=<slug>` returns the published
// PublishedSnapshot (theme tokens for light + dark, ordered section list per
// page, and the header/footer/announcement layout blocks) — or `null` when the
// merchant has never published. The storefront layers this on top of the
// existing themeToCss(StorefrontTheme) path; a null snapshot keeps the legacy
// composed-commerce homepage as the empty-store fallback.
//
// Drafts are NOT exposed here — the authenticated /v1/sitebuilder/preview
// endpoint serves the dashboard customizer. Public storefront = published only.

import type { PublishedSnapshot, SectionSnapshot } from '@sparx/sitebuilder';

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}
interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

export type { PublishedSnapshot, SectionSnapshot } from '@sparx/sitebuilder';

/**
 * Fetch the tenant's published site snapshot, or null if nothing is published
 * (or the read fails — a brand-new/erroring store still renders via the
 * commerce fallback rather than throwing).
 */
export async function getPublishedSite(tenantSlug: string): Promise<PublishedSnapshot | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/v1/public/storefront/site?tenant=${encodeURIComponent(tenantSlug)}`,
      {
        // Site config changes on publish; the publish flow purges these tags
        // (see app/api/revalidate — `site:<slug>` scope). Falls back to TTL.
        next: { revalidate: 300, tags: ['sparx-storefront', `tenant:${tenantSlug}`, `site:${tenantSlug}`] },
      }
    );
    const json = (await res.json()) as SuccessEnvelope<PublishedSnapshot | null> | ErrorEnvelope;
    if (!res.ok || 'error' in json) return null;
    return json.data;
  } catch {
    return null;
  }
}

/** Ordered, visible sections for one page key (`"home"` or a CMS page slug). */
export function sectionsForPage(
  snapshot: PublishedSnapshot | null,
  pageKey: string
): SectionSnapshot[] {
  if (!snapshot) return [];
  return snapshot.sections
    .filter((s) => s.pageKey === pageKey && s.visible)
    .sort((a, b) => a.position - b.position);
}

// ── Navigation ──────────────────────────────────────────────────────────

export interface NavNode {
  id: string;
  label: string;
  href: string;
  openInNewTab: boolean;
  children: NavNode[];
}

interface NavMenu {
  id: string;
  location: string;
  name: string;
  items: NavNode[];
}

/** Resolve a CMS NavigationMenu id into renderable, href-resolved nav nodes.
 *  Returns [] on any failure so the layout falls back to its default links. */
export async function getNavigationMenu(
  tenantSlug: string,
  menuId: string
): Promise<NavNode[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/v1/public/content/navigation/${encodeURIComponent(menuId)}?tenant=${encodeURIComponent(tenantSlug)}`,
      { next: { revalidate: 300, tags: ['sparx-storefront', `content:${tenantSlug}`, `site:${tenantSlug}`] } }
    );
    const json = (await res.json()) as SuccessEnvelope<NavMenu> | ErrorEnvelope;
    if (!res.ok || 'error' in json) return [];
    return json.data.items;
  } catch {
    return [];
  }
}
