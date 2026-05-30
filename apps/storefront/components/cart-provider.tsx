'use client';

// Client-side cart state. Holds the cart id + line snapshot and exposes
// optimistic mutations against the public cart API. The cart id is persisted
// in localStorage (the server also sets an httpOnly cookie for the API's own
// ownership checks); on mount we hydrate the live cart from the API.
//
// Slice 1 ships the context shape + hydration; the mutation methods are wired
// to the public cart API in Slice 2. Methods are present so consumers
// (CartButton, AddToCartButton, cart page) can be built against a stable API.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const STORAGE_KEY = 'sparx_cart_id';

export interface CartLine {
  id: string;
  variantId: string;
  productHandle: string | null;
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface CartState {
  cartId: string | null;
  lines: CartLine[];
  subtotalCents: number;
  count: number;
  currency: string;
  loading: boolean;
  /** Drawer (mini-cart) open state. */
  drawerOpen: boolean;
}

export interface CartContextValue extends CartState {
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateItem: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
  applyDiscount: (code: string) => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}

interface CartProviderProps {
  tenantSlug: string;
  currency: string;
  children: React.ReactNode;
}

export function CartProvider({ tenantSlug, currency, children }: CartProviderProps) {
  const [state, setState] = useState<CartState>({
    cartId: null,
    lines: [],
    subtotalCents: 0,
    count: 0,
    currency,
    loading: false,
    drawerOpen: false,
  });
  const cartIdRef = useRef<string | null>(null);

  const persistId = useCallback((id: string | null) => {
    cartIdRef.current = id;
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode / disabled storage — cookie still backs ownership */
    }
  }, []);

  // Hydrate the live cart from the API given a known cart id.
  const refresh = useCallback(async () => {
    const id = cartIdRef.current;
    if (!id) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}?tenant=${encodeURIComponent(tenantSlug)}`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!res.ok) {
        if (res.status === 404) persistId(null);
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const json = (await res.json()) as { data: CartApiShape };
      setState((s) => ({ ...s, ...fromApi(json.data), loading: false }));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [persistId, tenantSlug]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        cartIdRef.current = stored;
        void refresh();
      }
    } catch {
      /* ignore */
    }
  }, [refresh]);

  // ── Mutations (fully wired in Slice 2) ──────────────────────
  const ensureCart = useCallback(async (): Promise<string> => {
    if (cartIdRef.current) return cartIdRef.current;
    const res = await fetch(
      `${API_BASE}/v1/public/commerce/cart?tenant=${encodeURIComponent(tenantSlug)}`,
      { method: 'POST', credentials: 'include' }
    );
    const json = (await res.json()) as { data: { cartId: string } };
    persistId(json.data.cartId);
    return json.data.cartId;
  }, [persistId, tenantSlug]);

  const addItem = useCallback(
    async (variantId: string, quantity = 1) => {
      const id = await ensureCart();
      await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/items?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ variantId, quantity }),
        }
      );
      await refresh();
      setState((s) => ({ ...s, drawerOpen: true }));
    },
    [ensureCart, refresh, tenantSlug]
  );

  const updateItem = useCallback(
    async (lineId: string, quantity: number) => {
      const id = cartIdRef.current;
      if (!id) return;
      await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/items/${lineId}?tenant=${encodeURIComponent(
          tenantSlug
        )}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ quantity }),
        }
      );
      await refresh();
    },
    [refresh, tenantSlug]
  );

  const removeItem = useCallback(
    async (lineId: string) => {
      const id = cartIdRef.current;
      if (!id) return;
      await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/items/${lineId}?tenant=${encodeURIComponent(
          tenantSlug
        )}`,
        { method: 'DELETE', credentials: 'include' }
      );
      await refresh();
    },
    [refresh, tenantSlug]
  );

  const applyDiscount = useCallback(
    async (code: string) => {
      const id = await ensureCart();
      await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/discount?tenant=${encodeURIComponent(
          tenantSlug
        )}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        }
      );
      await refresh();
    },
    [ensureCart, refresh, tenantSlug]
  );

  const openDrawer = useCallback(() => setState((s) => ({ ...s, drawerOpen: true })), []);
  const closeDrawer = useCallback(() => setState((s) => ({ ...s, drawerOpen: false })), []);

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      addItem,
      updateItem,
      removeItem,
      applyDiscount,
      openDrawer,
      closeDrawer,
      refresh,
    }),
    [state, addItem, updateItem, removeItem, applyDiscount, openDrawer, closeDrawer, refresh]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ── API shape mapping ──────────────────────────────────────────
interface CartApiShape {
  cartId: string;
  currency: string;
  items: Array<{
    id: string;
    variantId: string;
    productHandle?: string | null;
    title: string;
    variantTitle?: string | null;
    imageUrl?: string | null;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>;
  totals: { subtotalCents: number };
}

function fromApi(data: CartApiShape): Omit<CartState, 'loading' | 'drawerOpen'> {
  const lines: CartLine[] = data.items.map((i) => ({
    id: i.id,
    variantId: i.variantId,
    productHandle: i.productHandle ?? null,
    title: i.title,
    variantTitle: i.variantTitle ?? null,
    imageUrl: i.imageUrl ?? null,
    unitPriceCents: i.unitPriceCents,
    quantity: i.quantity,
    lineTotalCents: i.lineTotalCents,
  }));
  return {
    cartId: data.cartId,
    lines,
    subtotalCents: data.totals.subtotalCents,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    currency: data.currency,
  };
}
