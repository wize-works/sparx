// collectionService — manual product lists and rules-driven smart
// collections. Rule evaluation runs through the commerce-indexer worker
// on a debounce; the storefront reads from the materialized list.

import type {
  CreateCollectionInput,
  SetCollectionProductsInput,
  UpdateCollectionInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export interface CollectionSummary {
  id: string;
  name: string;
  handle: string;
  type: 'manual' | 'rules';
  productCount: number;
  featured: boolean;
  updatedAt: string;
}

export function list(
  _ctx: ServiceContext,
  _filter: { type?: 'manual' | 'rules'; featured?: boolean; take?: number; skip?: number } = {}
): Promise<{ items: CollectionSummary[]; total: number }> {
  return notImplemented('collectionService.list');
}

export function get(_ctx: ServiceContext, _collectionId: string): Promise<unknown> {
  return notImplemented('collectionService.get');
}

export function getByHandle(_ctx: ServiceContext, _handle: string): Promise<unknown> {
  return notImplemented('collectionService.getByHandle');
}

export function create(
  _ctx: ServiceContext,
  _input: CreateCollectionInput
): Promise<{ id: string; handle: string }> {
  return notImplemented('collectionService.create');
}

export function update(
  _ctx: ServiceContext,
  _collectionId: string,
  _input: UpdateCollectionInput
): Promise<void> {
  return notImplemented('collectionService.update');
}

export function setProducts(
  _ctx: ServiceContext,
  _input: SetCollectionProductsInput
): Promise<void> {
  return notImplemented('collectionService.setProducts');
}

export function remove(_ctx: ServiceContext, _collectionId: string): Promise<void> {
  return notImplemented('collectionService.remove');
}

/** Triggers a re-evaluation of a rules-driven collection's membership
 *  via the commerce-indexer worker. Returns immediately; the storefront
 *  sees the updated list on the next index flush. */
export function reindex(_ctx: ServiceContext, _collectionId: string): Promise<void> {
  return notImplemented('collectionService.reindex');
}
