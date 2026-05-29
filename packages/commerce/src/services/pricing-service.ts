// pricingService — price list / contract / bulk tier CRUD plus the
// deterministic cart-pricing pipeline that resolves a variant to a
// PricedLine with full trace.

import type {
  BulkSetPriceListEntriesInput,
  CreateBulkPriceTierInput,
  CreateContractPriceInput,
  CreatePriceListInput,
  PriceListEntryInput,
  PriceResolutionRequest,
  PricedLine,
  UpdatePriceListInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Price lists ──────────────────────────────────────────────────────

export function listPriceLists(_ctx: ServiceContext): Promise<unknown[]> {
  return notImplemented('pricingService.listPriceLists');
}

export function getPriceList(_ctx: ServiceContext, _id: string): Promise<unknown> {
  return notImplemented('pricingService.getPriceList');
}

export function createPriceList(
  _ctx: ServiceContext,
  _input: CreatePriceListInput
): Promise<{ id: string }> {
  return notImplemented('pricingService.createPriceList');
}

export function updatePriceList(
  _ctx: ServiceContext,
  _id: string,
  _input: UpdatePriceListInput
): Promise<void> {
  return notImplemented('pricingService.updatePriceList');
}

export function archivePriceList(_ctx: ServiceContext, _id: string): Promise<void> {
  return notImplemented('pricingService.archivePriceList');
}

export function setPriceListEntry(
  _ctx: ServiceContext,
  _input: PriceListEntryInput
): Promise<void> {
  return notImplemented('pricingService.setPriceListEntry');
}

export function bulkSetEntries(
  _ctx: ServiceContext,
  _input: BulkSetPriceListEntriesInput
): Promise<{ updated: number }> {
  return notImplemented('pricingService.bulkSetEntries');
}

// ─── Bulk tiers + contract prices ─────────────────────────────────────

export function createBulkTier(
  _ctx: ServiceContext,
  _input: CreateBulkPriceTierInput
): Promise<{ id: string }> {
  return notImplemented('pricingService.createBulkTier');
}

export function createContractPrice(
  _ctx: ServiceContext,
  _input: CreateContractPriceInput
): Promise<{ id: string }> {
  return notImplemented('pricingService.createContractPrice');
}

export function listContractPricesForAccount(
  _ctx: ServiceContext,
  _b2bAccountId: string
): Promise<unknown[]> {
  return notImplemented('pricingService.listContractPricesForAccount');
}

// ─── Resolution pipeline ──────────────────────────────────────────────
//
// The single deterministic function the cart calls. Order:
//   contract_price → price_list → bulk_tier → variant_base
// Then layered:
//   discount (priority order, respect stacking) → gift_card → store_credit
// Each step appends a PriceTraceStep so the storefront can answer
// "why is this the price?" without recomputing.

export function resolve(_ctx: ServiceContext, _req: PriceResolutionRequest): Promise<PricedLine> {
  return notImplemented('pricingService.resolve');
}

export function resolveCart(
  _ctx: ServiceContext,
  _cartId: string
): Promise<{ lines: PricedLine[]; totalCents: number }> {
  return notImplemented('pricingService.resolveCart');
}
