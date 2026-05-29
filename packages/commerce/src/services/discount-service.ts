// discountService — codes, automatic discounts, gift cards, store credit.
// Pricing pipeline applies these on top of the base/price-list resolution.

import type {
  AdjustGiftCardInput,
  CreateDiscountInput,
  GrantStoreCreditInput,
  IssueGiftCardInput,
  RedeemDiscountInput,
  RedeemGiftCardInput,
  SpendStoreCreditInput,
  UpdateDiscountInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Discounts ────────────────────────────────────────────────────────

export function listDiscounts(_ctx: ServiceContext): Promise<unknown[]> {
  return notImplemented('discountService.listDiscounts');
}

export function getDiscount(_ctx: ServiceContext, _id: string): Promise<unknown> {
  return notImplemented('discountService.getDiscount');
}

export function createDiscount(
  _ctx: ServiceContext,
  _input: CreateDiscountInput
): Promise<{ id: string; code: string | null }> {
  return notImplemented('discountService.createDiscount');
}

export function updateDiscount(
  _ctx: ServiceContext,
  _id: string,
  _input: UpdateDiscountInput
): Promise<void> {
  return notImplemented('discountService.updateDiscount');
}

export function archiveDiscount(_ctx: ServiceContext, _id: string): Promise<void> {
  return notImplemented('discountService.archiveDiscount');
}

export function redeemCode(
  _ctx: ServiceContext,
  _input: RedeemDiscountInput
): Promise<{ discountId: string; appliedDeltaCents: number }> {
  return notImplemented('discountService.redeemCode');
}

// ─── Gift cards ───────────────────────────────────────────────────────

export interface GiftCardSummary {
  id: string;
  code: string;
  balanceCents: number;
  currency: string;
  status: string;
  expiresAt: string | null;
}

export function issueGiftCard(
  _ctx: ServiceContext,
  _input: IssueGiftCardInput
): Promise<{ id: string; code: string }> {
  return notImplemented('discountService.issueGiftCard');
}

export function lookupGiftCard(
  _ctx: ServiceContext,
  _codeOrId: string
): Promise<GiftCardSummary | null> {
  return notImplemented('discountService.lookupGiftCard');
}

export function redeemGiftCard(
  _ctx: ServiceContext,
  _input: RedeemGiftCardInput
): Promise<{ appliedCents: number; remainingBalanceCents: number }> {
  return notImplemented('discountService.redeemGiftCard');
}

export function adjustGiftCard(
  _ctx: ServiceContext,
  _input: AdjustGiftCardInput
): Promise<{ newBalanceCents: number }> {
  return notImplemented('discountService.adjustGiftCard');
}

// ─── Store credit ─────────────────────────────────────────────────────

export interface StoreCreditBalance {
  customerId: string;
  balanceCents: number;
  currency: string;
}

export function getStoreCreditBalance(
  _ctx: ServiceContext,
  _customerId: string
): Promise<StoreCreditBalance | null> {
  return notImplemented('discountService.getStoreCreditBalance');
}

export function grantStoreCredit(
  _ctx: ServiceContext,
  _input: GrantStoreCreditInput
): Promise<{ newBalanceCents: number }> {
  return notImplemented('discountService.grantStoreCredit');
}

export function spendStoreCredit(
  _ctx: ServiceContext,
  _input: SpendStoreCreditInput
): Promise<{ spentCents: number; remainingBalanceCents: number }> {
  return notImplemented('discountService.spendStoreCredit');
}
