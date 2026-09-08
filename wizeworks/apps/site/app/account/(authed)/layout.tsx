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
import type { AccountOffers } from '@/lib/customer-client';
import { cn } from '@/lib/cn';

interface AccountNavItem {
  label: string;
  href: string;
  /** Absent = every shop has this. Present = show it only where the shop can
   *  actually deliver it (issue 335). */
  offered?: (offers: AccountOffers) => boolean;
}

const NAV: AccountNavItem[] = [
  { label: 'Overview', href: '/account' },
  { label: 'Orders', href: '/account/orders' },
  // Ships with the account area rather than being something a tenant has to
  // build: a return she cannot start herself becomes an email to the shop.
  { label: 'Returns', href: '/account/returns' },
  // Same reasoning as Returns: any shop may be asked to quote for work.
  { label: 'Estimates', href: '/account/estimates' },
  { label: 'Bookings', href: '/account/bookings', offered: (o) => o.bookings },
  // Support. Every shop has customers who need to ask something.
  { label: 'Requests', href: '/account/requests' },
  { label: 'Wishlist', href: '/account/wishlist' },
  { label: 'Addresses', href: '/account/addresses' },
  { label: 'Payment methods', href: '/account/payment-methods' },
  { label: 'Profile', href: '/account/profile' },
  { label: 'B2B Account', href: '/account/b2b', offered: (o) => o.b2b },
];

export default function AuthedAccountLayout({ children }: { children: React.ReactNode }) {
  const { customer, offers, status, logout } = useCustomer();
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
      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="skeleton h-60" />
      </div>
    );
  }

  const displayName = customer.firstName ?? customer.email ?? 'Your account';

  const linkBase =
    'block rounded-field px-3 py-[0.6rem] text-left text-[0.95rem] transition-colors';

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-[clamp(1.5rem,4vw,3rem)] max-[760px]:grid-cols-1">
        {/* Written narrow-first on purpose. `flex-col` with a `max-[760px]:flex-row`
            beside it does NOT give a row on a phone: the two are the same utility,
            so the sheet's own order decides which wins and the media query never
            gets a say. It read as column at 356px while the `static` and `wrap`
            beside it applied, which is what made it look like it worked. Stated
            the other way round the later utility is the one inside the query, so
            each width gets what it asks for (issue 299). */}
        <nav
          className="flex flex-row flex-wrap gap-1 min-[761px]:sticky min-[761px]:top-[92px] min-[761px]:flex-col"
          aria-label="Account"
        >
          {/* Whose account this is heads the list at either width, so `w-full`:
              in a wrapping row it would otherwise sit in the line as one more chip.
              `min-w-0` + `break-all` because an email address is ONE unbreakable
              token: at 220px this column fits about 24 characters, and anything
              longer was painted straight out of the sidebar and over the sentence
              in the next column. `marguerite.adeyemi@example.com` overlapped
              "Manage your orders and details here." by 11px (issue 379). Both
              lines take it — `displayName` falls back to the email too. */}
          <div className="border-base-300 mb-2 flex w-full min-w-0 flex-col gap-[0.15rem] border-b px-3 pt-2 pb-4">
            <strong className="break-all">{displayName}</strong>
            {customer.email ? (
              <span className="text-base-content break-all">{customer.email}</span>
            ) : null}
          </div>
          {NAV.filter((item) => item.offered?.(offers) ?? true).map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/account' && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  linkBase,
                  active
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-base-content hover:bg-base-200'
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={cn(
              linkBase,
              'text-base-content hover:bg-base-200 w-full cursor-pointer border-0 bg-transparent'
            )}
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
