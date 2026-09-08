'use client';

// Client-side cart state. Holds the cart id + guest token + line snapshot and
// exposes optimistic mutations against the public cart API (via the same-origin
// /api/sparx proxy). Cart creation issues an opaque guest token that the API
// checks via the `x-cart-token` header; we persist both id + token in
// localStorage and replay the token on every call. On mount we hydrate.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { mediaUrl } from '@/lib/media';
import { useCustomer } from '@/components/customer-provider';

// Same-origin proxy to api-rest (app/api/sparx/[...path]/route.ts) — keeps the
// cart token + future customer cookie first-party and sidesteps CORS.
const API_BASE = '/api/sparx';
const ID_KEY = 'sparx_cart_id';
const TOKEN_KEY = 'sparx_cart_token';

export interface CartLine {
  id: string;
  variantId: string;
  productHandle: string | null;
  title: string;
  variantTitle: string | null;
  sku: string;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface CartTotals {
  subtotalCents: number;
  discountTotalCents: number;
  shippingTotalCents: number;
  taxTotalCents: number;
  /** Already SUBTRACTED inside totalCents. Kept as its own figure so a summary
   *  can name the money rather than leave a gap: rows that do not add up to the
   *  total under them read as a broken page, and this is what closed it. */
  giftCardAppliedCents: number;
  accountCreditAppliedCents: number;
  // Disclosed only at checkout (docs/48 §6) once a payment method is known; the
  // cart itself carries no surcharge, so this is absent in cart context.
  surchargeTotalCents?: number;
  totalCents: number;
}

/** Made to order (issue 026). An ordinary basket reads as no notice and the
 *  whole total due now, which is what every screen assumed before this. */
export interface CartMadeToOrder {
  /** `YYYY-MM-DD` in the SHOP's zone, or null when nothing needs notice. Null
   *  is not "ready today" and must not be rendered as one. */
  readyOn: string | null;
  noticeDays: number | null;
  dueNowCents: number;
  balanceCents: number;
  depositCents: number;
}

export const NOTHING_MADE_TO_ORDER: CartMadeToOrder = {
  readyOn: null,
  noticeDays: null,
  dueNowCents: 0,
  balanceCents: 0,
  depositCents: 0,
};

export interface CartState {
  cartId: string | null;
  lines: CartLine[];
  totals: CartTotals;
  /** Made to order (issue 026) — the day the basket can be collected and how
   *  the money splits between checkout and collection. */
  madeToOrder: CartMadeToOrder;
  appliedDiscountCodes: string[];
  /** The gift card reserved against this basket. A list because the discount
   *  codes beside it are one and the two are read together; the basket models a
   *  single card. */
  appliedGiftCardCodes: string[];
  count: number;
  currency: string;
  loading: boolean;
  drawerOpen: boolean;
}

export interface CartContextValue extends CartState {
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateItem: (lineId: string, quantity: number) => Promise<void>;
  removeItem: (lineId: string) => Promise<void>;
  /** Apply whatever is printed on the code the shopper is holding. The server
   *  decides whether it is a discount or a gift card, because she cannot and
   *  should not have to. */
  applyCode: (
    code: string
  ) => Promise<{ ok: boolean; kind?: 'discount' | 'gift_card'; error?: string }>;
  removeDiscount: (code: string) => Promise<void>;
  removeGiftCard: () => Promise<void>;
  openDrawer: () => void;
  closeDrawer: () => void;
  refresh: () => Promise<void>;
  /** Clear local cart state after an order completes. */
  reset: () => void;
}

/** Thrown by cart mutations when the API rejects the change, so callers can show
 *  the shopper a real message instead of failing silently. `status` is the HTTP
 *  status — 409 means the variant went out of stock under a `deny` policy. */
export class CartError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CartError';
    this.status = status;
  }
}

/** The server's own words out of a 422 envelope, when it wrote any. Null on
 *  anything unreadable, so the caller falls back to its generic line rather
 *  than showing a shopper an empty message or a parse error. */
async function validationMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    const said = body.error?.message;
    return typeof said === 'string' && said.trim() !== '' ? said : null;
  } catch {
    return null;
  }
}

const EMPTY_TOTALS: CartTotals = {
  subtotalCents: 0,
  discountTotalCents: 0,
  shippingTotalCents: 0,
  taxTotalCents: 0,
  giftCardAppliedCents: 0,
  accountCreditAppliedCents: 0,
  totalCents: 0,
};

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}

interface CartProviderProps {
  tenantSlug: string;
  /** Active site slug (docs/58 D1). Sent on cart creation so the order placed
   *  from this cart is tagged with its origin site. Omitted → no specific site. */
  propertySlug?: string;
  currency: string;
  children: React.ReactNode;
}

export function CartProvider({ tenantSlug, propertySlug, currency, children }: CartProviderProps) {
  const [state, setState] = useState<CartState>({
    cartId: null,
    lines: [],
    totals: EMPTY_TOTALS,
    madeToOrder: NOTHING_MADE_TO_ORDER,
    appliedDiscountCodes: [],
    appliedGiftCardCodes: [],
    count: 0,
    currency,
    loading: false,
    drawerOpen: false,
  });
  const cartIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const persist = useCallback((id: string | null, token: string | null) => {
    cartIdRef.current = id;
    tokenRef.current = token;
    try {
      if (id) localStorage.setItem(ID_KEY, id);
      else localStorage.removeItem(ID_KEY);
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode / disabled storage */
    }
  }, []);

  const authHeaders = useCallback(
    (): Record<string, string> => (tokenRef.current ? { 'x-cart-token': tokenRef.current } : {}),
    []
  );

  const applyApi = useCallback(
    (data: CartApiShape) =>
      setState((s) => ({ ...s, ...fromApi(data, tenantSlug), loading: false })),
    [tenantSlug]
  );

  const refresh = useCallback(async () => {
    const id = cartIdRef.current;
    if (!id) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}?tenant=${encodeURIComponent(tenantSlug)}`,
        { headers: authHeaders(), cache: 'no-store' }
      );
      if (!res.ok) {
        if (res.status === 404 || res.status === 403) persist(null, null);
        setState((s) => ({ ...s, loading: false }));
        return;
      }
      const json = (await res.json()) as { data: CartApiShape };
      applyApi(json.data);
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [applyApi, authHeaders, persist, tenantSlug]);

  useEffect(() => {
    try {
      const id = localStorage.getItem(ID_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      if (id && token) {
        cartIdRef.current = id;
        tokenRef.current = token;
        void refresh();
      }
    } catch {
      /* ignore */
    }
  }, [refresh]);

  // A login/register may have consolidated this shopper's cart onto a new
  // identity server-side (CustomerProvider's cartHandoff — see its docblock):
  // adopt it so items priced retail while anonymous show correctly instead
  // of the cart silently appearing empty (its old cached id/token 404s once
  // the server has merged/deleted that cart — ownership is token-only).
  const { cartHandoff, clearCartHandoff } = useCustomer();
  useEffect(() => {
    if (!cartHandoff) return;
    persist(cartHandoff.cartId, cartHandoff.guestToken);
    void refresh();
    clearCartHandoff();
  }, [cartHandoff, clearCartHandoff, persist, refresh]);

  // Create a cart on first write, capturing the issued ownership token.
  const ensureCart = useCallback(async (): Promise<string> => {
    if (cartIdRef.current) return cartIdRef.current;
    // Tag the cart with the active site (docs/58 D1) so the resulting order
    // inherits its origin property.
    const qs = new URLSearchParams({ tenant: tenantSlug });
    if (propertySlug) qs.set('property', propertySlug);
    const res = await fetch(`${API_BASE}/v1/public/commerce/cart?${qs.toString()}`, {
      method: 'POST',
    });
    const json = (await res.json()) as { data: CartApiShape & { token: string } };
    persist(json.data.cartId, json.data.token);
    applyApi(json.data);
    return json.data.cartId;
  }, [applyApi, persist, tenantSlug, propertySlug]);

  const addItem = useCallback(
    async (variantId: string, quantity = 1) => {
      const id = await ensureCart();
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/items?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ variantId, quantity }),
        }
      );
      if (!res.ok) {
        // Surface the failure — do NOT open the drawer or resolve as if it worked.
        // The silica buy-box form behavior awaits this promise and settles its
        // visible state (success/error) from it, and <ProductDetail> catches it to
        // show an inline message. Swallowing the error here (the old `if (res.ok)`
        // + unconditional drawer-open) is exactly what made a sold-out add read as
        // a false "Submitted." with an empty cart — BUG-001. The server's 409
        // message is developer-facing, so map to shopper-friendly copy.
        // A 422 carries a message written FOR the shopper — "only 4 left for
        // today, there will be more tomorrow" (issue 026). Replacing it with
        // "please try again" sends somebody to retry a thing that cannot work
        // until tomorrow, which is worse than saying nothing.
        const said = res.status === 422 ? await validationMessage(res) : null;
        throw new CartError(
          said ??
            (res.status === 409
              ? 'Sorry, this item just sold out.'
              : 'Sorry, we couldn’t add that to your cart. Please try again.'),
          res.status
        );
      }
      applyApi(((await res.json()) as { data: CartApiShape }).data);
      setState((s) => ({ ...s, drawerOpen: true }));
    },
    [applyApi, authHeaders, ensureCart, tenantSlug]
  );

  const updateItem = useCallback(
    async (lineId: string, quantity: number) => {
      const id = cartIdRef.current;
      if (!id) return;
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/items/${lineId}?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ quantity }),
        }
      );
      if (res.ok) {
        applyApi(((await res.json()) as { data: CartApiShape }).data);
        return;
      }
      // Raising a quantity can be refused for the same reason adding one can
      // (issue 026). The stepper's caller shows this; without it the number
      // silently snapped back with no explanation.
      throw new CartError(
        (res.status === 422 ? await validationMessage(res) : null) ??
          'Sorry, we couldn’t change that. Please try again.',
        res.status
      );
    },
    [applyApi, authHeaders, tenantSlug]
  );

  const removeItem = useCallback(
    async (lineId: string) => {
      const id = cartIdRef.current;
      if (!id) return;
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/items/${lineId}?tenant=${encodeURIComponent(tenantSlug)}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (res.ok) applyApi(((await res.json()) as { data: CartApiShape }).data);
    },
    [applyApi, authHeaders, tenantSlug]
  );

  // One box, either kind of code. A shopper handed a gift card types it into the
  // only code box on the page; when that box was a DISCOUNT box she was told
  // there was no such discount, and the money on a live card was unreachable.
  // The server tries both and says which it was, so the reply can name what
  // happened instead of just changing a number.
  const applyCode = useCallback(
    async (
      code: string
    ): Promise<{ ok: boolean; kind?: 'discount' | 'gift_card'; error?: string }> => {
      const id = await ensureCart();
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/code?tenant=${encodeURIComponent(tenantSlug)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ code }),
        }
      );
      if (res.ok) {
        const data = ((await res.json()) as { data: CartApiShape & { kind?: string } }).data;
        applyApi(data);
        return { ok: true, kind: data.kind === 'gift_card' ? 'gift_card' : 'discount' };
      }
      const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: err?.error?.message ?? 'That code can’t be applied.' };
    },
    [applyApi, authHeaders, ensureCart, tenantSlug]
  );

  const removeGiftCard = useCallback(async () => {
    const id = cartIdRef.current;
    if (!id) return;
    const res = await fetch(
      `${API_BASE}/v1/public/commerce/cart/${id}/gift-card?tenant=${encodeURIComponent(tenantSlug)}`,
      { method: 'DELETE', headers: authHeaders() }
    );
    if (res.ok) applyApi(((await res.json()) as { data: CartApiShape }).data);
  }, [applyApi, authHeaders, tenantSlug]);

  const removeDiscount = useCallback(
    async (code: string) => {
      const id = cartIdRef.current;
      if (!id) return;
      const res = await fetch(
        `${API_BASE}/v1/public/commerce/cart/${id}/discount/${encodeURIComponent(code)}?tenant=${encodeURIComponent(tenantSlug)}`,
        { method: 'DELETE', headers: authHeaders() }
      );
      if (res.ok) applyApi(((await res.json()) as { data: CartApiShape }).data);
    },
    [applyApi, authHeaders, tenantSlug]
  );

  const openDrawer = useCallback(() => setState((s) => ({ ...s, drawerOpen: true })), []);
  const closeDrawer = useCallback(() => setState((s) => ({ ...s, drawerOpen: false })), []);

  const reset = useCallback(() => {
    persist(null, null);
    setState((s) => ({
      ...s,
      cartId: null,
      lines: [],
      totals: EMPTY_TOTALS,
      madeToOrder: NOTHING_MADE_TO_ORDER,
      appliedDiscountCodes: [],
      appliedGiftCardCodes: [],
      count: 0,
      drawerOpen: false,
    }));
  }, [persist]);

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      addItem,
      updateItem,
      removeItem,
      applyCode,
      removeDiscount,
      removeGiftCard,
      openDrawer,
      closeDrawer,
      refresh,
      reset,
    }),
    [
      state,
      addItem,
      updateItem,
      removeItem,
      applyCode,
      removeDiscount,
      removeGiftCard,
      openDrawer,
      closeDrawer,
      refresh,
      reset,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// ── API shape mapping ──────────────────────────────────────────
interface CartApiShape {
  cartId: string;
  currency: string;
  appliedDiscountCodes?: string[];
  appliedGiftCardCodes?: string[];
  items: {
    id: string;
    variantId: string;
    productHandle?: string | null;
    title: string;
    variantTitle?: string | null;
    sku?: string;
    imageMediaId?: string | null;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }[];
  totals: {
    subtotalCents: number;
    discountTotalCents?: number;
    shippingTotalCents?: number;
    taxTotalCents?: number;
    giftCardAppliedCents?: number;
    accountCreditAppliedCents?: number;
    totalCents?: number;
  };
  madeToOrder?: Partial<CartMadeToOrder>;
}

function fromApi(
  data: CartApiShape,
  tenantSlug: string
): Omit<CartState, 'loading' | 'drawerOpen'> {
  const lines: CartLine[] = data.items.map((i) => ({
    id: i.id,
    variantId: i.variantId,
    productHandle: i.productHandle ?? null,
    title: i.title,
    variantTitle: i.variantTitle ?? null,
    sku: i.sku ?? '',
    imageUrl: mediaUrl(i.imageMediaId ?? null, tenantSlug),
    unitPriceCents: i.unitPriceCents,
    quantity: i.quantity,
    lineTotalCents: i.lineTotalCents,
  }));
  return {
    cartId: data.cartId,
    lines,
    appliedDiscountCodes: data.appliedDiscountCodes ?? [],
    appliedGiftCardCodes: data.appliedGiftCardCodes ?? [],
    totals: {
      subtotalCents: data.totals.subtotalCents,
      discountTotalCents: data.totals.discountTotalCents ?? 0,
      shippingTotalCents: data.totals.shippingTotalCents ?? 0,
      taxTotalCents: data.totals.taxTotalCents ?? 0,
      giftCardAppliedCents: data.totals.giftCardAppliedCents ?? 0,
      accountCreditAppliedCents: data.totals.accountCreditAppliedCents ?? 0,
      totalCents: data.totals.totalCents ?? data.totals.subtotalCents,
    },
    // Defaults mean "no deposit, everything due now" — the shape every cart had
    // before this existed, so an older response reads as an ordinary basket
    // rather than as one with nothing to pay.
    madeToOrder: {
      readyOn: data.madeToOrder?.readyOn ?? null,
      noticeDays: data.madeToOrder?.noticeDays ?? null,
      dueNowCents:
        data.madeToOrder?.dueNowCents ?? data.totals.totalCents ?? data.totals.subtotalCents,
      balanceCents: data.madeToOrder?.balanceCents ?? 0,
      depositCents: data.madeToOrder?.depositCents ?? 0,
    },
    count: lines.reduce((n, l) => n + l.quantity, 0),
    currency: data.currency,
  };
}
