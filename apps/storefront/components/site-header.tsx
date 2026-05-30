// Storefront header — brand, primary nav, search, account + cart actions.
// Server component: nav links are derived from the tenant's collections plus
// the standard storefront routes. The cart count is a client island
// (CartCount) so the rest of the header stays static/streamable.

import Link from 'next/link';

import { mediaUrl } from '@/lib/media';
import type { ResolvedTenant } from '@/lib/tenant';
import { CartButton } from './cart-button';
import { MobileNav } from './mobile-nav';
import { SearchBox } from './search-box';

export interface NavItem {
  label: string;
  href: string;
}

export interface SiteHeaderProps {
  tenant: ResolvedTenant;
  nav: NavItem[];
  announcement?: string | null;
}

export function SiteHeader({ tenant, nav, announcement }: SiteHeaderProps) {
  const logo = mediaUrl(tenant.theme?.logoMediaId ?? null, tenant.slug);

  return (
    <header className="sf-header">
      {announcement ? <div className="sf-announce">{announcement}</div> : null}
      <div className="sf-container">
        <div className="sf-header__bar">
          <MobileNav nav={nav} brand={tenant.name} />

          <Link href="/" className="sf-header__brand" aria-label={`${tenant.name} home`}>
            {logo ? <img src={logo} alt={tenant.name} /> : tenant.name}
          </Link>

          <nav className="sf-nav" aria-label="Primary">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="sf-nav__link">
                {item.label}
              </Link>
            ))}
          </nav>

          <SearchBox tenantSlug={tenant.slug} />

          <div className="sf-header__actions">
            <Link href="/search" className="sf-iconbtn sf-search--mobile" aria-label="Search">
              <SearchIcon />
            </Link>
            <Link href="/account" className="sf-iconbtn" aria-label="Account">
              <UserIcon />
            </Link>
            <CartButton />
          </div>
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg
      className="sf-search__icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
