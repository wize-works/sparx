'use client';

// Cart action in the header. Shows the live line count and opens the
// mini-cart drawer. Falls back to a plain /cart link if JS is disabled.

import Link from 'next/link';

import { useCart } from './cart-provider';

export function CartButton() {
  const { count, openDrawer } = useCart();

  return (
    <Link
      href="/cart"
      className="sf-iconbtn"
      aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      onClick={(e) => {
        // Progressive enhancement: open the drawer instead of navigating.
        e.preventDefault();
        openDrawer();
      }}
    >
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
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
      </svg>
      {count > 0 ? <span className="sf-iconbtn__count">{count > 99 ? '99+' : count}</span> : null}
    </Link>
  );
}
