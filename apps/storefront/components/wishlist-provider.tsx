'use client';

// Client-side wishlist state. When the shopper is signed in it loads the set of
// saved product ids so wishlist buttons across the catalog can render their
// toggled state without per-button fetches. Anonymous shoppers get an empty set
// and toggles route them to sign in (handled by the button).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useCustomer } from '@/components/customer-provider';
import { addToWishlist, getWishlist, removeFromWishlist } from '@/lib/customer-client';

export interface WishlistContextValue {
  /** Variant ids currently in the wishlist (items key on variant). */
  ids: Set<string>;
  ready: boolean;
  has: (variantId: string) => boolean;
  /** Toggle membership for a variant. Returns false (no-op) if not signed in. */
  toggle: (variantId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function useWishlist(): WishlistContextValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within <WishlistProvider>');
  return ctx;
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { tenantSlug, status } = useCustomer();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (status !== 'authenticated') {
      setIds(new Set());
      setReady(true);
      return;
    }
    try {
      const items = await getWishlist(tenantSlug);
      setIds(new Set(items.map((i) => i.variantId)));
    } catch {
      setIds(new Set());
    } finally {
      setReady(true);
    }
  }, [status, tenantSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const has = useCallback((variantId: string) => ids.has(variantId), [ids]);

  const toggle = useCallback(
    async (variantId: string): Promise<boolean> => {
      if (status !== 'authenticated') return false;
      const adding = !ids.has(variantId);
      // Optimistic.
      setIds((prev) => {
        const next = new Set(prev);
        if (adding) next.add(variantId);
        else next.delete(variantId);
        return next;
      });
      try {
        if (adding) await addToWishlist(tenantSlug, variantId);
        else await removeFromWishlist(tenantSlug, variantId);
      } catch {
        // Roll back on failure.
        setIds((prev) => {
          const next = new Set(prev);
          if (adding) next.delete(variantId);
          else next.add(variantId);
          return next;
        });
      }
      return true;
    },
    [ids, status, tenantSlug]
  );

  const value = useMemo<WishlistContextValue>(
    () => ({ ids, ready, has, toggle, refresh }),
    [ids, ready, has, toggle, refresh]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}
