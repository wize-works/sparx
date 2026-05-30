// Storefront footer — brand blurb, link columns (shop + collections + info),
// and a legal bottom bar. Link columns are data-driven so the layout can feed
// in collections and CMS/legal pages.

import Link from 'next/link';

import type { ResolvedTenant } from '@/lib/tenant';

export interface FooterColumn {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}

export interface FooterSocialLink {
  platform: string;
  url: string;
}

export interface SiteFooterProps {
  tenant: ResolvedTenant;
  columns: FooterColumn[];
  year: number;
  /** Merchant copyright line (Site Builder footer config); falls back to the
   *  default "© {year} {name}" when empty. */
  copyright?: string | null;
  socialLinks?: FooterSocialLink[];
}

export function SiteFooter({ tenant, columns, year, copyright, socialLinks }: SiteFooterProps) {
  return (
    <footer className="sf-footer">
      <div className="sf-container">
        <div className="sf-footer__grid">
          <div className="sf-footer__col">
            <span className="sf-header__brand">{tenant.name}</span>
            <p
              className="sf-muted"
              style={{ marginTop: '0.75rem', maxWidth: '34ch', lineHeight: 1.6 }}
            >
              Quality products, fast shipping, and support that actually helps.
            </p>
            {socialLinks && socialLinks.length > 0 ? (
              <div className="sf-footer__social">
                {socialLinks.map((s) => (
                  <a
                    key={s.platform}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sf-iconbtn"
                    aria-label={s.platform}
                  >
                    {s.platform.charAt(0).toUpperCase()}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
          {columns.map((col) => (
            <div key={col.title} className="sf-footer__col">
              <h4>{col.title}</h4>
              {col.links.map((link) =>
                link.external ? (
                  <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                )
              )}
            </div>
          ))}
        </div>
        <div className="sf-footer__bottom">
          <span>{copyright ?? `© ${year} ${tenant.name}. All rights reserved.`}</span>
          <span>
            Powered by <strong>Sparx</strong>
          </span>
        </div>
      </div>
    </footer>
  );
}
