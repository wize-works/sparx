// variantService — variants are the purchasable SKU. They hang off a
// Product but can be queried independently (storefront PDP, inventory
// adjustments, dropship sync).

import type { CreateVariantInput, UpdateVariantInput } from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export interface VariantSummary {
  id: string;
  productId: string;
  sku: string;
  title: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  inventoryAvailable: number;
}

export function listForProduct(
  _ctx: ServiceContext,
  _productId: string
): Promise<VariantSummary[]> {
  return notImplemented('variantService.listForProduct');
}

export function get(_ctx: ServiceContext, _variantId: string): Promise<unknown> {
  return notImplemented('variantService.get');
}

export function getBySku(_ctx: ServiceContext, _sku: string): Promise<unknown> {
  return notImplemented('variantService.getBySku');
}

export function create(
  _ctx: ServiceContext,
  _productId: string,
  _input: CreateVariantInput
): Promise<{ id: string }> {
  return notImplemented('variantService.create');
}

export function update(
  _ctx: ServiceContext,
  _variantId: string,
  _input: UpdateVariantInput
): Promise<void> {
  return notImplemented('variantService.update');
}

export function archive(_ctx: ServiceContext, _variantId: string): Promise<void> {
  return notImplemented('variantService.archive');
}
