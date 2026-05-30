'use client';

// Saved items. Lists the customer's wishlist with a link to each product and a
// remove action that stays in sync with the shared WishlistProvider (so heart
// buttons elsewhere update too).

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useCustomer } from '@/components/customer-provider';
import { useWishlist } from '@/components/wishlist-provider';
import { getWishlist, type WishlistItem } from '@/lib/customer-client';
import { formatMoney } from '@/lib/format';
import { mediaUrl } from '@/lib/media';

export default function WishlistPage() {
  const { tenantSlug } = useCustomer();
  const { toggle, ids } = useWishlist();
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getWishlist(tenantSlug)
      .then((res) => active && setItems(res))
      .catch(() => active && setError('Could not load your wishlist.'));
    return () => {
      active = false;
    };
  }, [tenantSlug]);

  // Reflect removals made here (or via heart buttons) without a refetch.
  const visible = items?.filter((i) => ids.has(i.variantId)) ?? null;

  async function remove(variantId: string) {
    await toggle(variantId);
  }

  return (
    <div>
      <h1 className="sf-h2" style={{ marginBottom: '1.25rem' }}>
        Wishlist
      </h1>

      {error ? (
        <div className="sf-alert sf-alert--error" role="alert">
          {error}
        </div>
      ) : visible === null ? (
        <div className="sf-skeleton" style={{ height: 160 }} />
      ) : visible.length === 0 ? (
        <div className="sf-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="sf-muted" style={{ marginBottom: '1rem' }}>
            You haven’t saved anything yet.
          </p>
          <Link href="/products" className="sf-btn sf-btn--primary">
            Browse products
          </Link>
        </div>
      ) : (
        <div
          className="sf-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
        >
          {visible.map((it) => {
            const img = mediaUrl(it.imageMediaId, tenantSlug);
            return (
              <div key={it.variantId} className="sf-card" style={{ overflow: 'hidden' }}>
                <Link href={`/products/${it.handle}`} style={{ display: 'block' }}>
                  <div className="sf-line__media" style={{ aspectRatio: '1', width: '100%' }}>
                    {img ? <img src={img} alt={it.title} /> : null}
                  </div>
                  <div style={{ padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{it.title}</div>
                    <div className="sf-muted" style={{ fontSize: '0.85rem' }}>
                      {formatMoney(it.priceCents)}
                    </div>
                  </div>
                </Link>
                <div style={{ padding: '0 0.75rem 0.75rem' }}>
                  <button
                    type="button"
                    className="sf-btn sf-btn--ghost"
                    onClick={() => void remove(it.variantId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
