// Read-only MCP tools. Each is a thin wrapper over a service-layer
// function — a bug fixed in the service fixes the MCP tool at the same
// time. Per locked decision #7 from the CRM architecture, mirrored here.

import { z } from 'zod';

import {
  inventoryService,
  productService,
  reportingService,
  reviewService,
  subscriptionService,
  cartService,
  fitmentService,
  providerService,
  returnService,
} from '../services';
import type { AnyMcpTool, McpToolDefinition } from './registry';

const DateRange = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const getProducts: McpToolDefinition = {
  name: 'get_products',
  description: 'List products with optional filters (status, category, vendor, tag, search).',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({
    status: z.enum(['draft', 'active', 'archived']).optional(),
    categoryId: z.string().uuid().optional(),
    vendor: z.string().max(127).optional(),
    tag: z.string().max(63).optional(),
    q: z.string().max(255).optional(),
    take: z.number().int().min(1).max(100).default(25),
  }),
  run: (ctx, input) => productService.list(ctx, input as Record<string, unknown>),
};

const getProduct: McpToolDefinition = {
  name: 'get_product',
  description: 'Fetch a single product with its variants, fitment, and media.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({ productId: z.string().uuid() }),
  run: (ctx, input) => productService.get(ctx, (input as { productId: string }).productId),
};

const getLowInventory: McpToolDefinition = {
  name: 'get_low_inventory',
  description: 'List variants below their reorder point, optionally scoped to a warehouse.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({
    warehouseId: z.string().uuid().optional(),
    take: z.number().int().min(1).max(100).default(50),
  }),
  run: (ctx, input) => inventoryService.listLowStock(ctx, input as Record<string, unknown>),
};

const getRevenueSummary: McpToolDefinition = {
  name: 'get_revenue_summary',
  description: 'Gross + net revenue, order count, AOV for a date range.',
  scope: 'read:commerce',
  confirmation: false,
  input: DateRange,
  run: (ctx, input) => reportingService.revenueSummary(ctx, input as { from: string; to: string }),
};

const getTopProducts: McpToolDefinition = {
  name: 'get_top_products',
  description: 'Top products by revenue or units for a date range.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({
    range: DateRange,
    limit: z.number().int().min(1).max(100).default(10),
  }),
  run: (ctx, input) =>
    reportingService.topProducts(
      ctx,
      input as { range: { from: string; to: string }; limit: number }
    ),
};

const getTopCustomers: McpToolDefinition = {
  name: 'get_top_customers',
  description: 'Top customers by total spend for a date range.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({
    range: DateRange,
    limit: z.number().int().min(1).max(100).default(10),
  }),
  run: (ctx, input) =>
    reportingService.topCustomers(
      ctx,
      input as { range: { from: string; to: string }; limit: number }
    ),
};

const getConversionFunnel: McpToolDefinition = {
  name: 'get_conversion_funnel',
  description: 'Sessions → carts → checkouts → orders funnel for a date range.',
  scope: 'read:commerce',
  confirmation: false,
  input: DateRange,
  run: (ctx, input) =>
    reportingService.conversionFunnel(ctx, input as { from: string; to: string }),
};

const getAbandonedCarts: McpToolDefinition = {
  name: 'get_abandoned_carts',
  description: 'Cart abandonment + recovery metrics for a date range.',
  scope: 'read:commerce',
  confirmation: false,
  input: DateRange,
  run: (ctx, input) => reportingService.abandonedCarts(ctx, input as { from: string; to: string }),
};

const getSubscriptionStats: McpToolDefinition = {
  name: 'get_subscription_stats',
  description: 'Active subscriptions, MRR, new + churned counts.',
  scope: 'read:commerce',
  confirmation: false,
  input: DateRange,
  run: (ctx, input) =>
    reportingService.subscriptionMetrics(ctx, input as { from: string; to: string }),
};

const getInventoryValuation: McpToolDefinition = {
  name: 'get_inventory_valuation',
  description: 'Snapshot of inventory units + cost + retail valuation.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({}),
  run: (ctx) => reportingService.inventoryValuation(ctx),
};

const getReviewsPendingModeration: McpToolDefinition = {
  name: 'get_reviews_pending_moderation',
  description: 'Reviews awaiting moderator action.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({}),
  run: (ctx) => reviewService.listPendingModeration(ctx),
};

const getSubscriptionsForCustomer: McpToolDefinition = {
  name: 'get_subscriptions_for_customer',
  description: 'List active and paused subscriptions for one customer.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({ customerId: z.string().uuid() }),
  run: (ctx, input) =>
    subscriptionService.listForCustomer(ctx, (input as { customerId: string }).customerId),
};

const searchFitment: McpToolDefinition = {
  name: 'search_fitment',
  description: 'Find products that fit a vehicle (make/model/engine/year).',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({
    makeId: z.string().uuid().optional(),
    modelId: z.string().uuid().optional(),
    engineId: z.string().uuid().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
  }),
  run: (ctx, input) => fitmentService.lookup(ctx, input as Record<string, unknown>),
};

const getProviderHealth: McpToolDefinition = {
  name: 'get_provider_health',
  description: 'List installed providers and their health status.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({}),
  run: (ctx) => providerService.listInstallations(ctx),
};

const getReturns: McpToolDefinition = {
  name: 'get_returns',
  description: 'List return requests filtered by status.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({
    status: z
      .enum([
        'requested',
        'approved',
        'denied',
        'awaiting_shipment',
        'in_transit',
        'received',
        'inspecting',
        'inspected',
        'refunded',
        'cancelled',
      ])
      .optional(),
    take: z.number().int().min(1).max(100).default(25),
  }),
  run: (ctx, input) => returnService.list(ctx, input as Record<string, unknown>),
};

const getCart: McpToolDefinition = {
  name: 'get_cart',
  description: 'Fetch a cart by ID with its priced lines and totals.',
  scope: 'read:commerce',
  confirmation: false,
  input: z.object({ cartId: z.string().uuid() }),
  run: (ctx, input) => cartService.get(ctx, (input as { cartId: string }).cartId),
};

export const readTools: AnyMcpTool[] = [
  getProducts,
  getProduct,
  getLowInventory,
  getRevenueSummary,
  getTopProducts,
  getTopCustomers,
  getConversionFunnel,
  getAbandonedCarts,
  getSubscriptionStats,
  getInventoryValuation,
  getReviewsPendingModeration,
  getSubscriptionsForCustomer,
  searchFitment,
  getProviderHealth,
  getReturns,
  getCart,
];
