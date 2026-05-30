'use client';

// Guard + chrome for the authenticated account area. Redirects anonymous
// visitors to /account/login (preserving where they were headed) and frames the
// signed-in pages with the account sidebar. The session check is client-side
// against the CustomerProvider (the session cookie is httpOnly, so the profile
// is resolved via /account/me rather than read on the server).

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useCustomer } from '@/components/customer-provider';

interface AccountNavItem {
  label: string;
  href: string;
}

const NAV: AccountNavItem[] = [
  { label: 'Overview', href: '/account' },
  { label: 'Orders', href: '/account/orders' },
  { label: 'Wishlist', href: '/account/wishlist' },
  { label: 'Addresses', href: '/account/addresses' },
  { label: 'Profile', href: '/account/profile' },
];

export default function AuthedAccountLayout({ children }: { children: React.ReactNode }) {
  const { customer, status, logout } = useCustomer();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'anonymous') {
      const redirect = encodeURIComponent(pathname || '/account');
      router.replace(`/account/login?redirect=${redirect}`);
    }
  }, [status, pathname, router]);

  if (status !== 'authenticated' || !customer) {
    return (
      <div className="sf-container" style={{ paddingBlock: '3rem' }}>
        <div className="sf-skeleton" style={{ height: 240 }} />
      </div>
    );
  }

  const displayName = customer.firstName ?? customer.email ?? 'Your account';

  return (
    <div className="sf-container" style={{ paddingBlock: '2rem' }}>
      <div className="sf-account">
        <nav className="sf-account__nav" aria-label="Account">
          <div className="sf-account__who">
            <strong>{displayName}</strong>
            {customer.email ? <span className="sf-muted">{customer.email}</span> : null}
          </div>
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/account' && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={['sf-account__link', active && 'is-active'].filter(Boolean).join(' ')}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className="sf-account__link"
            onClick={() => {
              void logout().then(() => router.push('/'));
            }}
          >
            Sign out
          </button>
        </nav>
        <div>{children}</div>
      </div>
    </div>
  );
}
