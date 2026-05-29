// cartService — cart CRUD + merge + abandonment marking. Storefront and
// B2B portal write through this; never directly to Prisma.

import type {
  AddCartItemInput,
  CartItemSnapshot,
  CartTotals,
  CreateCartInput,
  MergeCartsInput,
  UpdateCartItemInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export interface CartSnapshot {
  cartId: string;
  customerId: string | null;
  channel: string;
  currency: string;
  items: CartItemSnapshot[];
  appliedDiscountCodes: string[];
  appliedGiftCardCodes: string[];
  storeCreditAppliedCents: number;
  totals: CartTotals;
  expiresAt: string;
  abandonedAt: string | null;
}

export function create(_ctx: ServiceContext, _input: CreateCartInput): Promise<{ cartId: string }> {
  return notImplemented('cartService.create');
}

export function get(_ctx: ServiceContext, _cartId: string): Promise<CartSnapshot | null> {
  return notImplemented('cartService.get');
}

export function getByGuestToken(
  _ctx: ServiceContext,
  _guestToken: string
): Promise<CartSnapshot | null> {
  return notImplemented('cartService.getByGuestToken');
}

export function addItem(
  _ctx: ServiceContext,
  _input: AddCartItemInput
): Promise<{ cartItemId: string }> {
  return notImplemented('cartService.addItem');
}

export function updateItem(_ctx: ServiceContext, _input: UpdateCartItemInput): Promise<void> {
  return notImplemented('cartService.updateItem');
}

export function removeItem(_ctx: ServiceContext, _cartItemId: string): Promise<void> {
  return notImplemented('cartService.removeItem');
}

export function clear(_ctx: ServiceContext, _cartId: string): Promise<void> {
  return notImplemented('cartService.clear');
}

export function merge(
  _ctx: ServiceContext,
  _input: MergeCartsInput
): Promise<{ mergedCartId: string }> {
  return notImplemented('cartService.merge');
}

export function markAbandoned(_ctx: ServiceContext, _cartId: string): Promise<void> {
  return notImplemented('cartService.markAbandoned');
}

export function markRecovered(_ctx: ServiceContext, _cartId: string): Promise<void> {
  return notImplemented('cartService.markRecovered');
}

/** Sweep for the cart-abandonment-worker. Returns carts idle longer than
 *  `cutoffMinutes` so the worker can flip them + emit cart.abandoned. */
export function findIdleCarts(_ctx: ServiceContext, _cutoffMinutes: number): Promise<string[]> {
  return notImplemented('cartService.findIdleCarts');
}
