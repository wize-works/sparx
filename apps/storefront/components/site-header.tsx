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
  /** Announcement link target (when the announcement bar links somewhere). */
  announcementHref?: string | null;
  /** Hide the inline search box when the merchant's header config disables it. */
  showSearch?: boolean;
  /** Where the logo sits in the bar (Site Builder header config). */
  logoPlacement?: 'left' | 'center';
  /** Light/dark toggle island, rendered only when appearancePolicy = toggle. */
  modeToggle?: React.ReactNode;
}

export function SiteHeader({
  tenant,
  nav,
  announcement,
  announcementHref,
  showSearch = true,
  logoPlacement = 'left',
  modeToggle,
}: SiteHeaderProps) {
  const logo = mediaUrl(tenant.theme?.logoMediaId ?? null, tenant.slug);

  return (
    <header className="sf-header">
      {announcement ? (
        <div className="sf-announce">
          {announcementHref ? (
            <Link href={announcementHref} className="sf-announce__link">
              {announcement}
            </Link>
          ) : (
            announcement
          )}
        </div>
      ) : null}
      <div className="sf-container">
        <div className="sf-header__bar" data-logo={logoPlacement}>
          <MobileNav nav={nav} brand={tenant.name} />

          <Link href="/" className="sf-header__brand" aria-label={`${tenant.name} home`}>
            {/* Plain <img>: a merchant logo has unknown intrinsic dimensions and
                a redirecting media src, so next/image (which needs width+height
                or a sized fill parent) doesn't fit; CSS caps it at 34px tall. */}
            {logo ? <img src={logo} alt={tenant.name} /> : tenant.name}
          </Link>

          <nav className="sf-nav" aria-label="Primary">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="sf-nav__link">
                {item.label}
              </Link>
            ))}
          </nav>

          {showSearch ? <SearchBox tenantSlug={tenant.slug} /> : null}

          <div className="sf-header__actions">
            {showSearch ? (
              <Link href="/search" className="sf-iconbtn sf-search--mobile" aria-label="Search">
                <SearchIcon />
              </Link>
            ) : null}
            {modeToggle}
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
