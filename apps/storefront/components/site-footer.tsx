// Storefront footer — brand blurb, link columns (shop + collections + info),
// and a legal bottom bar. Link columns are data-driven so the layout can feed
// in collections and CMS/legal pages.

import Link from 'next/link';

import type { ResolvedTenant } from '@/lib/tenant';

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export interface SiteFooterProps {
  tenant: ResolvedTenant;
  columns: FooterColumn[];
  year: number;
}

export function SiteFooter({ tenant, columns, year }: SiteFooterProps) {
  return (
    <footer className="sf-footer">
      <div className="sf-container">
        <div className="sf-footer__grid">
          <div className="sf-footer__col">
            <span className="sf-header__brand">{tenant.name}</span>
            <p className="sf-muted" style={{ marginTop: '0.75rem', maxWidth: '34ch', lineHeight: 1.6 }}>
              Quality products, fast shipping, and support that actually helps.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title} className="sf-footer__col">
              <h4>{col.title}</h4>
              {col.links.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="sf-footer__bottom">
          <span>
            © {year} {tenant.name}. All rights reserved.
          </span>
          <span>
            Powered by <strong>Sparx</strong>
          </span>
        </div>
      </div>
    </footer>
  );
}
