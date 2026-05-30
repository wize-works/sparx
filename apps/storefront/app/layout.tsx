// Storefront root layout. Resolves the tenant from the Host, injects the
// merchant's theme tokens, and frames every page in the shared header/footer
// chrome with the client CartProvider mounted around it.
//
// Unknown hosts (no tenant) render a bare frame — the page-level not-found
// handles the "store not found" messaging.

import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

import { CartProvider } from '@/components/cart-provider';
import { CustomerProvider } from '@/components/customer-provider';
import { MiniCart } from '@/components/mini-cart';
import { SiteHeader, type NavItem } from '@/components/site-header';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';
import { listCollections } from '@/lib/commerce';
import { mediaUrl } from '@/lib/media';
import { resolveTenant } from '@/lib/tenant';
import { themeToCss } from '@/lib/theme';

import './globals.css';
import './storefront.css';

const FOOTER_YEAR = 2026; // static so SSR output stays deterministic/cacheable

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) {
    return { title: 'Store not found', robots: { index: false, follow: false } };
  }
  const favicon = mediaUrl(tenant.theme?.faviconMediaId ?? null, tenant.slug);
  return {
    title: { default: tenant.name, template: `%s · ${tenant.name}` },
    description: `Shop ${tenant.name}.`,
    robots: { index: true, follow: true },
    ...(favicon ? { icons: { icon: favicon } } : {}),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenant();
  const themeCss = themeToCss(tenant?.theme ?? null);

  // Build nav + footer columns from the tenant's collections (best-effort —
  // a brand-new store with no collections still renders the standard links).
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

  const nav: NavItem[] = [
    { label: 'Shop all', href: '/products' },
    ...collectionNav,
    { label: 'Collections', href: '/collections' },
  ];

  const footerColumns: FooterColumn[] = [
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

  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>{themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}</head>
      <body className="sf-body">
        {tenant ? (
          <CustomerProvider tenantSlug={tenant.slug}>
            <CartProvider tenantSlug={tenant.slug} currency={tenant.storefront.defaultCurrency}>
              <div className="sf-frame">
                <SiteHeader tenant={tenant} nav={nav} />
                <main className="sf-main">{children}</main>
                <SiteFooter tenant={tenant} columns={footerColumns} year={FOOTER_YEAR} />
              </div>
              <MiniCart />
            </CartProvider>
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
