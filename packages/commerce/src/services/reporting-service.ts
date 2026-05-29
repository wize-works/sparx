// reportingService — read-only metrics surfaced in the dashboard home,
// the analytics tab, and the MCP read tools. Live queries at first;
// nightly rollups land in a separate worker once volume justifies it.

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export interface DateRange {
  from: string; // ISO
  to: string; // ISO
}

export interface RevenueSummary {
  rangeLabel: string;
  ordersCount: number;
  grossRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  averageOrderValueCents: number;
  currency: string;
}

export function revenueSummary(_ctx: ServiceContext, _range: DateRange): Promise<RevenueSummary> {
  return notImplemented('reportingService.revenueSummary');
}

export interface TopProductRow {
  productId: string;
  productTitle: string;
  unitsSold: number;
  revenueCents: number;
}

export function topProducts(
  _ctx: ServiceContext,
  _input: { range: DateRange; limit?: number }
): Promise<TopProductRow[]> {
  return notImplemented('reportingService.topProducts');
}

export interface TopCustomerRow {
  customerId: string;
  customerName: string;
  ordersCount: number;
  totalSpentCents: number;
}

export function topCustomers(
  _ctx: ServiceContext,
  _input: { range: DateRange; limit?: number }
): Promise<TopCustomerRow[]> {
  return notImplemented('reportingService.topCustomers');
}

export interface ConversionFunnel {
  rangeLabel: string;
  sessions: number;
  cartsCreated: number;
  checkoutsStarted: number;
  ordersPlaced: number;
  cartToCheckoutRate: number;
  checkoutToOrderRate: number;
  overallConversion: number;
}

export function conversionFunnel(
  _ctx: ServiceContext,
  _range: DateRange
): Promise<ConversionFunnel> {
  return notImplemented('reportingService.conversionFunnel');
}

export interface AbandonedCartReport {
  rangeLabel: string;
  abandonedCount: number;
  recoveredCount: number;
  recoveryRate: number;
  recoveredRevenueCents: number;
}

export function abandonedCarts(
  _ctx: ServiceContext,
  _range: DateRange
): Promise<AbandonedCartReport> {
  return notImplemented('reportingService.abandonedCarts');
}

export interface SubscriptionMetrics {
  activeCount: number;
  mrrCents: number;
  churnedThisPeriod: number;
  newThisPeriod: number;
  currency: string;
}

export function subscriptionMetrics(
  _ctx: ServiceContext,
  _range: DateRange
): Promise<SubscriptionMetrics> {
  return notImplemented('reportingService.subscriptionMetrics');
}

export interface InventoryValuation {
  totalUnits: number;
  totalCostCents: number;
  totalRetailCents: number;
  currency: string;
  asOf: string;
}

export function inventoryValuation(_ctx: ServiceContext): Promise<InventoryValuation> {
  return notImplemented('reportingService.inventoryValuation');
}
