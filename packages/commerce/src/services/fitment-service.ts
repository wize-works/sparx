// fitmentService — vehicle reference data + per-product applicability.
// Drives the auto-parts case (Gillett Diesel) end-to-end: storefront
// filter, B2B catalog visibility, MCP search_fitment tool.

import type {
  BulkAssignFitmentInput,
  CreateVehicleEngineInput,
  CreateVehicleMakeInput,
  CreateVehicleModelInput,
  FitmentLookupQuery,
  ProductFitmentInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Reference data CRUD ──────────────────────────────────────────────

export function listMakes(_ctx: ServiceContext): Promise<unknown[]> {
  return notImplemented('fitmentService.listMakes');
}

export function createMake(
  _ctx: ServiceContext,
  _input: CreateVehicleMakeInput
): Promise<{ id: string }> {
  return notImplemented('fitmentService.createMake');
}

export function listModels(_ctx: ServiceContext, _makeId: string): Promise<unknown[]> {
  return notImplemented('fitmentService.listModels');
}

export function createModel(
  _ctx: ServiceContext,
  _input: CreateVehicleModelInput
): Promise<{ id: string }> {
  return notImplemented('fitmentService.createModel');
}

export function listEngines(_ctx: ServiceContext, _modelId: string): Promise<unknown[]> {
  return notImplemented('fitmentService.listEngines');
}

export function createEngine(
  _ctx: ServiceContext,
  _input: CreateVehicleEngineInput
): Promise<{ id: string }> {
  return notImplemented('fitmentService.createEngine');
}

// ─── Per-product fitment ──────────────────────────────────────────────

export function listForProduct(_ctx: ServiceContext, _productId: string): Promise<unknown[]> {
  return notImplemented('fitmentService.listForProduct');
}

export function setForProduct(
  _ctx: ServiceContext,
  _productId: string,
  _fitments: Omit<ProductFitmentInput, 'productId'>[]
): Promise<void> {
  return notImplemented('fitmentService.setForProduct');
}

export function bulkAssign(
  _ctx: ServiceContext,
  _input: BulkAssignFitmentInput
): Promise<{ rowsAffected: number }> {
  return notImplemented('fitmentService.bulkAssign');
}

// ─── Catalog filter ───────────────────────────────────────────────────

export interface FitmentLookupResult {
  productIds: string[];
  total: number;
}

export function lookup(
  _ctx: ServiceContext,
  _query: FitmentLookupQuery
): Promise<FitmentLookupResult> {
  return notImplemented('fitmentService.lookup');
}
