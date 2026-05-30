'use client';

// Heart toggle for saving a product to the wishlist. Signed-in shoppers toggle
// membership (optimistic via WishlistProvider); anonymous shoppers are sent to
// sign in and returned to where they were.

import { usePathname, useRouter } from 'next/navigation';

import { useCustomer } from '@/components/customer-provider';
import { useWishlist } from '@/components/wishlist-provider';

export function WishlistButton({
  productId,
  variantId,
  className,
}: {
  productId: string;
  variantId?: string;
  className?: string;
}) {
  const { status } = useCustomer();
  const { has, toggle } = useWishlist();
  const router = useRouter();
  const pathname = usePathname();

  const saved = has(productId);

  async function onClick() {
    if (status !== 'authenticated') {
      router.push(`/account/login?redirect=${encodeURIComponent(pathname || '/')}`);
      return;
    }
    await toggle(productId, variantId);
  }

  return (
    <button
      type="button"
      className={['sf-wishbtn', saved && 'is-saved', className].filter(Boolean).join(' ')}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      title={saved ? 'Saved' : 'Save to wishlist'}
      onClick={() => void onClick()}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
}
