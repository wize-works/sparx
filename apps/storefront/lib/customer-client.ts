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

/** Returns the current customer, or null if not signed in (401). */
export async function getMe(tenantSlug: string): Promise<Customer | null> {
  const res = await fetch(url('/v1/public/commerce/account/me', tenantSlug), {
    cache: 'no-store',
  });
  if (res.status === 401) return null;
  return (await parse<{ customer: Customer }>(res)).customer;
}
