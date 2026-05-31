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

// The storefront consumes the published snapshot as JSON over HTTP, so it owns
// the *consumer's view* of that payload rather than depending on the heavy
// `@sparx/sitebuilder` service package (which pulls in @sparx/db, @sparx/ui,
// react, and the whole MCP/service layer — none of which belong in this image).
// These interfaces mirror the publish output in
// packages/sitebuilder/src/services/publish-internals.ts — keep them in sync.

import type { CompiledThemeV2 } from '@sparx/storefront-themes';

export interface SectionSnapshot {
  id: string;
  pageKey: string;
  sectionType: string;
  position: number;
  visible: boolean;
  config: Record<string, unknown>;
}

export interface LayoutSnapshot {
  slot: string;
  navigationMenuId: string | null;
  config: Record<string, unknown>;
  visible: boolean;
}

export interface PublishedSnapshot {
  versionNumber: number;
  themeKey: string;
  appearancePolicy: string;
  compiledTokens: { light: Record<string, string>; dark: Record<string, string> };
  // Token Model v2 compiled set (docs/33) — present on snapshots from a
  // v2-aware api-rest; preferred over `compiledTokens` by the theme builder.
  compiledV2?: CompiledThemeV2;
  sections: SectionSnapshot[];
  layout: LayoutSnapshot[];
}

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}
interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
}

/**
 * Fetch the tenant's site snapshot, or null if nothing is published (or the
 * read fails — a brand-new/erroring store still renders via the commerce
 * fallback rather than throwing).
 *
 * With a `sitePreviewToken` (minted by the dashboard and forwarded from the
 * `?sparxSitePreview=` query) the api-rest endpoint returns the DRAFT
 * composition instead of the published snapshot, so the dashboard preview
 * iframe reflects unsaved work. Preview reads are uncached (`no-store`).
 */
export async function getPublishedSite(
  tenantSlug: string,
  sitePreviewToken?: string
): Promise<PublishedSnapshot | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/v1/public/storefront/site?tenant=${encodeURIComponent(tenantSlug)}`,
      sitePreviewToken
        ? { headers: { Authorization: `Preview ${sitePreviewToken}` }, cache: 'no-store' }
        : {
            // Site config changes on publish; the publish flow purges these tags
            // (see app/api/revalidate — `site:<slug>` scope). Falls back to TTL.
            next: {
              revalidate: 300,
              tags: ['sparx-storefront', `tenant:${tenantSlug}`, `site:${tenantSlug}`],
            },
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
export async function getNavigationMenu(tenantSlug: string, menuId: string): Promise<NavNode[]> {
  try {
    const res = await fetch(
      `${BASE_URL}/v1/public/content/navigation/${encodeURIComponent(menuId)}?tenant=${encodeURIComponent(tenantSlug)}`,
      {
        next: {
          revalidate: 300,
          tags: ['sparx-storefront', `content:${tenantSlug}`, `site:${tenantSlug}`],
        },
      }
    );
    const json = (await res.json()) as SuccessEnvelope<NavMenu> | ErrorEnvelope;
    if (!res.ok || 'error' in json) return [];
    return json.data.items;
  } catch {
    return [];
  }
}
