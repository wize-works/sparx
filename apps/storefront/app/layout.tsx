// Storefront root layout. Resolves the tenant from the Host, injects the
// merchant's theme tokens (light + dark), frames every page in header/footer
// chrome, and mounts the client providers.
//
// When the tenant has a published Site Builder snapshot, its compiled tokens
// (a superset of the StorefrontTheme columns — adds foreground/border/container)
// and its data-driven header/footer/announcement blocks take over. Without a
// snapshot the legacy themeToCss(StorefrontTheme) path and collection-derived
// chrome still render, so brand-new stores look polished out of the box.
//
// Unknown hosts (no tenant) render a bare frame — the page-level not-found
// handles the "store not found" messaging.

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

import type { HeaderConfig, FooterConfig, AnnouncementConfig } from '@sparx/sitebuilder-schemas';

import { CartProvider } from '@/components/cart-provider';
import { CustomerProvider } from '@/components/customer-provider';
import { WishlistProvider } from '@/components/wishlist-provider';
import { MiniCart } from '@/components/mini-cart';
import { ModeToggle } from '@/components/mode-toggle';
import { PreviewBridge } from '@/components/preview-bridge';
import { SiteHeader, type NavItem } from '@/components/site-header';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';
import { listCollections } from '@/lib/commerce';
import { mediaUrl } from '@/lib/media';
import { resolveTenant, type TenantTheme } from '@/lib/tenant';
import { buildStorefrontThemeCss } from '@/lib/theme';
import {
  getPublishedSite,
  getNavigationMenu,
  type NavNode,
  type PublishedSnapshot,
} from '@/lib/site';

import './globals.css';
import './storefront.css';

const FOOTER_YEAR = 2026; // static so SSR output stays deterministic/cacheable
const THEME_COOKIE = 'sparx_theme';

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) {
    return {
      title: 'Store not found',
      robots: { index: false, follow: false },
      icons: { icon: '/sparx-icon.svg' },
    };
  }
  const favicon = mediaUrl(tenant.theme?.faviconMediaId ?? null, tenant.slug);
  return {
    title: { default: tenant.name, template: `%s · ${tenant.name}` },
    description: `Shop ${tenant.name}.`,
    robots: { index: true, follow: true },
    // The merchant's own favicon always wins. Until they set one, fall back to
    // the Sparx mark (public/) rather than the browser's default globe — a
    // brand-new store still looks finished. Deliberately favicon-only: no
    // apple-icon / manifest, so Sparx never brands a merchant's home-screen
    // install. Assets: apps/storefront/public/{favicon.ico,sparx-icon.svg}.
    icons: favicon
      ? { icon: favicon }
      : {
          icon: [
            { url: '/sparx-icon.svg', type: 'image/svg+xml' },
            { url: '/favicon.ico', sizes: 'any' },
          ],
        },
  };
}

// ── Theme CSS ──────────────────────────────────────────────────────────────
//
// Compiled by the Token Model v2 engine (docs/33-token-model-v2.md). The theme
// key comes from the published snapshot when present, else the tenant's preset;
// brand identity + presentation surfaces are sourced from the data the layout
// already fetched. buildStorefrontThemeCss emits the canonical `--sf-*` tokens
// plus the legacy aliases the current storefront.css still reads.

function buildThemeCss(
  snapshot: PublishedSnapshot | null,
  theme: TenantTheme | null,
  preset: string | null | undefined
): string {
  const themeKey = snapshot?.themeKey ?? preset ?? 'apex';
  return buildStorefrontThemeCss({
    themeKey,
    tenantTheme: theme,
    snapshotTokens: snapshot?.compiledTokens ?? null,
    compiledV2: snapshot?.compiledV2 ?? null,
  });
}

// Inline, before-paint script that resolves data-theme for policies that can't
// be decided at SSR time (auto = prefers-color-scheme, toggle = cookie). Fixed
// policies (light-only / dark-only) are set on <html> server-side and need no
// script. Kept tiny and self-contained so it runs before first paint.
function noFlashScript(policy: 'auto' | 'toggle'): string {
  return `(function(){try{var d=document.documentElement;var p=${JSON.stringify(policy)};var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;if(p==='toggle'){var m=document.cookie.match(/(?:^|;\\s*)sparx_theme=(light|dark)/);d.setAttribute('data-theme',m?m[1]:(dark?'dark':'light'));}else{d.setAttribute('data-theme',dark?'dark':'light');}}catch(e){}})();`;
}

// ── Header / footer chrome from the snapshot's layout blocks ─────────────────

function navNodesToItems(nodes: NavNode[]): NavItem[] {
  return nodes.map((n) => ({ label: n.label, href: n.href }));
}

const isExternal = (href: string) => /^https?:\/\//i.test(href);

/** Empty/whitespace config strings → null so callers fall back to defaults. */
function blankToNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

// Map a nav menu into footer columns: a top-level item WITH children becomes a
// titled column; loose top-level leaves collect under a single "Links" column.
function navNodesToFooterColumns(nodes: NavNode[]): FooterColumn[] {
  const columns: FooterColumn[] = [];
  const loose: FooterColumn['links'] = [];
  for (const node of nodes) {
    if (node.children.length > 0) {
      columns.push({
        title: node.label,
        links: node.children.map((c) => ({
          label: c.label,
          href: c.href,
          external: isExternal(c.href),
        })),
      });
    } else {
      loose.push({ label: node.label, href: node.href, external: isExternal(node.href) });
    }
  }
  if (loose.length > 0) columns.unshift({ title: 'Links', links: loose });
  return columns;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenant();
  const snapshot = tenant ? await getPublishedSite(tenant.slug) : null;

  // Active base theme preset (additive registry) for the no-snapshot path.
  const themePreset = (tenant?.settings as { theme?: { preset?: string } } | undefined)?.theme
    ?.preset;
  const themeCss = buildThemeCss(snapshot, tenant?.theme ?? null, themePreset);

  // Appearance policy → initial data-theme + whether the no-flash script runs.
  const policy = snapshot?.appearancePolicy ?? 'light-only';
  let initialTheme: 'light' | 'dark' = 'light';
  if (policy === 'dark-only') {
    initialTheme = 'dark';
  } else if (policy === 'toggle') {
    const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
    initialTheme = cookieTheme === 'dark' ? 'dark' : 'light';
  }
  const dynamicPolicy = policy === 'auto' || policy === 'toggle' ? policy : null;

  // Resolve header/footer/announcement from the snapshot's layout blocks.
  const blocks: PublishedSnapshot['layout'] = snapshot?.layout ?? [];
  const headerBlock = blocks.find((b) => b.slot === 'header' && b.visible);
  const footerBlock = blocks.find((b) => b.slot === 'footer' && b.visible);
  const announceBlock = blocks.find((b) => b.slot === 'announcement' && b.visible);

  const headerConfig = (headerBlock?.config ?? {}) as Partial<HeaderConfig>;
  const footerConfig = (footerBlock?.config ?? {}) as Partial<FooterConfig>;
  const announceConfig = (announceBlock?.config ?? {}) as Partial<AnnouncementConfig>;

  // Default chrome (no snapshot, or snapshot block without a menu): derive nav
  // from the tenant's collections so a brand-new store still has working links.
  let collectionNav: NavItem[] = [];
  if (tenant) {
    try {
      const collections = await listCollections(tenant.slug);
      collectionNav = collections.slice(0, 4).map((c) => ({
        label: c.name,
        href: `/collections/${c.handle}`,
      }));
    } catch {
      collectionNav = [];
    }
  }

  let nav: NavItem[] = [
    { label: 'Shop all', href: '/products' },
    ...collectionNav,
    { label: 'Collections', href: '/collections' },
  ];

  let footerColumns: FooterColumn[] = [
    {
      title: 'Shop',
      links: [
        { label: 'All products', href: '/products' },
        { label: 'Collections', href: '/collections' },
        { label: 'Search', href: '/search' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Sign in', href: '/account' },
        { label: 'Orders', href: '/account/orders' },
        { label: 'Cart', href: '/cart' },
      ],
    },
    {
      title: 'Info',
      links: [
        { label: 'Contact', href: '/contact' },
        { label: 'Shipping', href: '/shipping-policy' },
        { label: 'Returns', href: '/returns-policy' },
      ],
    },
  ];

  // Snapshot nav menus override the defaults when present + non-empty.
  if (tenant && headerBlock?.navigationMenuId) {
    const items = await getNavigationMenu(tenant.slug, headerBlock.navigationMenuId);
    if (items.length > 0) nav = navNodesToItems(items);
  }
  if (tenant && footerBlock?.navigationMenuId) {
    const items = await getNavigationMenu(tenant.slug, footerBlock.navigationMenuId);
    const cols = navNodesToFooterColumns(items);
    if (cols.length > 0) footerColumns = cols;
  }

  const announcement =
    announceBlock && announceConfig.enabled && announceConfig.text ? announceConfig.text : null;
  const socialLinks = footerConfig.socialLinks ?? [];

  return (
    <html
      lang="en"
      data-theme={initialTheme}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
        {dynamicPolicy ? (
          <script dangerouslySetInnerHTML={{ __html: noFlashScript(dynamicPolicy) }} />
        ) : null}
      </head>
      <body className="sf-body">
        <PreviewBridge />
        {tenant ? (
          <CustomerProvider tenantSlug={tenant.slug}>
            <WishlistProvider>
              <CartProvider tenantSlug={tenant.slug} currency={tenant.storefront.defaultCurrency}>
                <div className="sf-frame">
                  <a href="#sf-main" className="sf-skip-link">
                    Skip to content
                  </a>
                  <SiteHeader
                    tenant={tenant}
                    nav={nav}
                    announcement={announcement}
                    announcementHref={blankToNull(announceConfig.linkUrl)}
                    showSearch={headerConfig.showSearch ?? true}
                    logoPlacement={headerConfig.logoPlacement ?? 'left'}
                    modeToggle={
                      policy === 'toggle' ? <ModeToggle initial={initialTheme} /> : undefined
                    }
                  />
                  <main className="sf-main" id="sf-main" tabIndex={-1}>
                    {children}
                  </main>
                  <SiteFooter
                    tenant={tenant}
                    columns={footerColumns}
                    year={FOOTER_YEAR}
                    copyright={blankToNull(footerConfig.copyright)}
                    socialLinks={socialLinks.map((s) => ({ platform: s.platform, url: s.url }))}
                  />
                </div>
                <MiniCart />
              </CartProvider>
            </WishlistProvider>
          </CustomerProvider>
        ) : (
          <div className="sf-frame">
            <main className="sf-main">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
