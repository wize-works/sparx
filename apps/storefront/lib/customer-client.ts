// Typed wrappers over the public customer-account API, via the same-origin
// /api/sparx proxy. The session is an httpOnly cookie set by api-rest and
// relayed by the proxy — so these calls just rely on the browser sending it
// (same-origin fetch includes cookies by default). On register/login we also
// forward the guest cart token so the server can claim the cart for the new
// session. See docs/27.

const API_BASE = '/api/sparx';
const CART_TOKEN_KEY = 'sparx_cart_token';

export interface Customer {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

export class AccountError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
  }
}

function url(path: string, tenantSlug: string): string {
  return `${API_BASE}${path}?tenant=${encodeURIComponent(tenantSlug)}`;
}

function cartTokenHeader(): Record<string, string> {
  try {
    const t = localStorage.getItem(CART_TOKEN_KEY);
    return t ? { 'x-cart-token': t } : {};
  } catch {
    return {};
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function parse<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false) {
    throw new AccountError(json?.error?.message ?? 'Something went wrong.', res.status);
  }
  return json.data as T;
}

export async function register(
  tenantSlug: string,
  input: { email: string; password: string; firstName?: string; lastName?: string }
): Promise<Customer> {
  const res = await fetch(url('/v1/public/commerce/account/register', tenantSlug), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cartTokenHeader() },
    body: JSON.stringify(input),
  });
  return (await parse<{ customer: Customer }>(res)).customer;
}

export async function login(
  tenantSlug: string,
  input: { email: string; password: string }
): Promise<Customer> {
  const res = await fetch(url('/v1/public/commerce/account/login', tenantSlug), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cartTokenHeader() },
    body: JSON.stringify(input),
  });
  return (await parse<{ customer: Customer }>(res)).customer;
}

export async function logout(tenantSlug: string): Promise<void> {
  await fetch(url('/v1/public/commerce/account/logout', tenantSlug), { method: 'POST' });
}

/** Always resolves (enumeration-safe): the server 200s whether or not the
 *  email exists, only sending mail when it does. */
export async function requestPasswordReset(tenantSlug: string, email: string): Promise<void> {
  await fetch(url('/v1/public/commerce/account/password/forgot', tenantSlug), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  tenantSlug: string,
  token: string,
  password: string
): Promise<void> {
  const res = await fetch(url('/v1/public/commerce/account/password/reset', tenantSlug), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  await parse<{ ok: true }>(res);
}

/** Returns the current customer, or null if not signed in (401). */
export async function getMe(tenantSlug: string): Promise<Customer | null> {
  const res = await fetch(url('/v1/public/commerce/account/me', tenantSlug), {
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  return (await parse<{ customer: Customer }>(res)).customer;
}

export async function updateProfile(
  tenantSlug: string,
  input: { firstName?: string | null; lastName?: string | null; phone?: string | null }
): Promise<Customer> {
  const res = await fetch(url('/v1/public/commerce/account/me', tenantSlug), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await parse<{ customer: Customer }>(res)).customer;
}

// ── Orders ────────────────────────────────────────────────────────────────

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  currency: string;
  placedAt: string;
}

export interface OrderDetail extends Omit<OrderSummary, never> {
  subtotalCents: number;
  taxTotalCents: number;
  shippingTotalCents: number;
  discountTotalCents: number;
  shippingAddress: Record<string, unknown> | null;
  items: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }[];
}

export async function getOrders(
  tenantSlug: string,
  page = 1,
  pageSize = 10
): Promise<{ orders: OrderSummary[]; total: number; totalPages: number }> {
  const res = await fetch(
    `${url('/v1/public/commerce/account/orders', tenantSlug)}&page=${page}&pageSize=${pageSize}`,
    { cache: 'no-store' }
  );
  const json = (await res.json().catch(() => null)) as {
    success: boolean;
    data?: OrderSummary[];
    meta?: { total?: number; total_pages?: number };
  } | null;
  if (!res.ok || !json || json.success === false) {
    throw new AccountError('Could not load orders.', res.status);
  }
  return {
    orders: json.data ?? [],
    total: json.meta?.total ?? 0,
    totalPages: json.meta?.total_pages ?? 1,
  };
}

export async function getOrder(tenantSlug: string, orderId: string): Promise<OrderDetail> {
  const res = await fetch(
    url(`/v1/public/commerce/account/orders/${encodeURIComponent(orderId)}`, tenantSlug),
    { cache: 'no-store' }
  );
  return parse<OrderDetail>(res);
}

// ── Addresses ───────────────────────────────────────────────────────────────

export interface Address {
  id: string;
  type: 'shipping' | 'billing' | 'both';
  label: string | null;
  recipientName: string | null;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  isDefault: boolean;
}

export type AddressInput = Omit<Address, 'id'>;

export async function getAddresses(tenantSlug: string): Promise<Address[]> {
  const res = await fetch(url('/v1/public/commerce/account/addresses', tenantSlug), {
    cache: 'no-store',
  });
  return (await parse<{ addresses: Address[] }>(res)).addresses;
}

export async function createAddress(
  tenantSlug: string,
  input: Partial<AddressInput>
): Promise<Address> {
  const res = await fetch(url('/v1/public/commerce/account/addresses', tenantSlug), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return (await parse<{ address: Address }>(res)).address;
}

export async function updateAddress(
  tenantSlug: string,
  addressId: string,
  input: Partial<AddressInput>
): Promise<Address> {
  const res = await fetch(
    url(`/v1/public/commerce/account/addresses/${encodeURIComponent(addressId)}`, tenantSlug),
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  return (await parse<{ address: Address }>(res)).address;
}

export async function deleteAddress(tenantSlug: string, addressId: string): Promise<void> {
  await fetch(
    url(`/v1/public/commerce/account/addresses/${encodeURIComponent(addressId)}`, tenantSlug),
    { method: 'DELETE' }
  );
}

// ── Wishlist ────────────────────────────────────────────────────────────────

// Wishlist items key on a variant; responses also carry the parent product so
// the UI can link + label.
export interface WishlistItem {
  variantId: string;
  productId: string;
  handle: string;
  title: string;
  imageMediaId: string | null;
  priceCents: number;
}

export async function getWishlist(tenantSlug: string): Promise<WishlistItem[]> {
  const res = await fetch(url('/v1/public/commerce/account/wishlist', tenantSlug), {
    cache: 'no-store',
  });
  if (res.status === 401) return [];
  return (await parse<{ items: WishlistItem[] }>(res)).items;
}

export async function addToWishlist(tenantSlug: string, variantId: string): Promise<void> {
  const res = await fetch(url('/v1/public/commerce/account/wishlist', tenantSlug), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ variantId }),
  });
  await parse<{ ok: true }>(res);
}

export async function removeFromWishlist(tenantSlug: string, variantId: string): Promise<void> {
  await fetch(
    url(`/v1/public/commerce/account/wishlist/${encodeURIComponent(variantId)}`, tenantSlug),
    { method: 'DELETE' }
  );
}
