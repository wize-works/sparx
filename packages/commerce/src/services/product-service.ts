// productService — read/write API for products + their variant tree.
//
// Phase 0 surfaces the typed contract; Phase 1 wires Prisma. Every state
// change follows the locked pattern:
//   1. Zod-validate input against @sparx/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit (so rolled-back writes never
//      emit phantom events)

import type {
  BulkTagProductsInput,
  BulkUpdateProductStatusInput,
  CreateProductInput,
  ProductStatus,
  UpdateProductInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Reads ────────────────────────────────────────────────────────────

export interface ListProductsFilter {
  status?: ProductStatus;
  categoryId?: string;
  collectionId?: string;
  vendor?: string;
  tag?: string;
  productType?: string;
  q?: string;
  hasFitment?: boolean;
  includeArchived?: boolean;
  take?: number;
  skip?: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'title' | 'price';
}

export interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string | null;
  productType: string | null;
  variantCount: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  imageUrl: string | null;
  updatedAt: string;
}

export function list(
  _ctx: ServiceContext,
  _filter: ListProductsFilter = {}
): Promise<{ items: ProductListItem[]; total: number }> {
  return notImplemented('productService.list');
}

export function get(_ctx: ServiceContext, _productId: string): Promise<unknown> {
  return notImplemented('productService.get');
}

export function getByHandle(_ctx: ServiceContext, _handle: string): Promise<unknown> {
  return notImplemented('productService.getByHandle');
}

// ─── Writes ───────────────────────────────────────────────────────────

export function create(
  _ctx: ServiceContext,
  _input: CreateProductInput
): Promise<{ id: string; handle: string }> {
  return notImplemented('productService.create');
}

export function update(
  _ctx: ServiceContext,
  _productId: string,
  _input: UpdateProductInput
): Promise<void> {
  return notImplemented('productService.update');
}

export function archive(_ctx: ServiceContext, _productId: string): Promise<void> {
  return notImplemented('productService.archive');
}

export function restore(_ctx: ServiceContext, _productId: string): Promise<void> {
  return notImplemented('productService.restore');
}

export function bulkUpdateStatus(
  _ctx: ServiceContext,
  _input: BulkUpdateProductStatusInput
): Promise<{ updated: number }> {
  return notImplemented('productService.bulkUpdateStatus');
}

export function bulkTag(
  _ctx: ServiceContext,
  _input: BulkTagProductsInput
): Promise<{ updated: number }> {
  return notImplemented('productService.bulkTag');
}

export function publish(_ctx: ServiceContext, _productId: string): Promise<void> {
  return notImplemented('productService.publish');
}

export function unpublish(_ctx: ServiceContext, _productId: string): Promise<void> {
  return notImplemented('productService.unpublish');
}
