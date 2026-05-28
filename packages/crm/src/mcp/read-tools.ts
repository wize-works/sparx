// Read-only MCP tools. Scope: 'read:crm'. No confirmation needed — the
// LLM (or agent) can call these freely. Each wraps a single service
// function; the input schemas keep parameters constrained to what the
// service expects.

import { z } from 'zod';

import {
  customerService,
  b2bAccountService,
  dealService,
  pipelineService,
  taskService,
  segmentService,
  activityService,
  orderService,
  quoteService,
  reportingService,
} from '../services';

import type { McpToolDefinition } from './registry';

const PaginationArgs = {
  take: z.number().int().min(1).max(100).optional().default(25),
  skip: z.number().int().min(0).optional().default(0),
};

export const getCustomers: McpToolDefinition = {
  name: 'get_customers',
  description:
    'List customers, optionally filtered by type/tag/segment/free-text. Returns up to 100 rows per call.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    type: z.enum(['prospect', 'retail', 'b2b']).optional(),
    tag: z.string().max(63).optional(),
    q: z.string().max(255).optional(),
    sortBy: z.enum(['updatedAt', 'createdAt', 'totalSpent', 'lastOrderAt']).optional(),
    ...PaginationArgs,
  }),
  run: (ctx, input) =>
    customerService.list(ctx, input as Parameters<typeof customerService.list>[1]),
};

export const getCustomer: McpToolDefinition = {
  name: 'get_customer',
  description: 'Fetch a single customer record by id, with totals and tags.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({ customerId: z.string().uuid() }),
  run: (ctx, input) => customerService.get(ctx, (input as { customerId: string }).customerId),
};

export const getTopCustomers: McpToolDefinition = {
  name: 'get_top_customers',
  description: 'Top N customers by lifetime spend.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    take: z.number().int().min(1).max(100).optional().default(10),
  }),
  run: (ctx, input) =>
    customerService.list(ctx, {
      take: (input as { take: number }).take,
      sortBy: 'totalSpent',
    }),
};

export const getInactiveCustomers: McpToolDefinition = {
  name: 'get_inactive_customers',
  description:
    'Customers who have ordered before but not in the last N days (default 90). Useful for win-back campaigns.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    daysInactive: z.number().int().min(1).max(3650).optional().default(90),
    take: z.number().int().min(1).max(100).optional().default(50),
  }),
  run: async (ctx, input) => {
    const { daysInactive, take } = input as { daysInactive: number; take: number };
    const cutoff = new Date(Date.now() - daysInactive * 86_400_000);
    const { items } = await customerService.list(ctx, { take, sortBy: 'lastOrderAt' });
    return items.filter((c) => c.lastOrderAt !== null && c.lastOrderAt < cutoff);
  },
};

export const getB2bAccounts: McpToolDefinition = {
  name: 'get_b2b_accounts',
  description: 'List B2B accounts with credit limits, utilization, pricing tier.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    q: z.string().max(255).optional(),
    status: z.enum(['active', 'credit_hold', 'suspended', 'inactive']).optional(),
    ...PaginationArgs,
  }),
  run: (ctx, input) =>
    b2bAccountService.list(ctx, input as Parameters<typeof b2bAccountService.list>[1]),
};

export const getPipeline: McpToolDefinition = {
  name: 'get_pipeline',
  description: 'Get a pipeline by id, including its stages.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({ pipelineId: z.string().uuid() }),
  run: (ctx, input) => pipelineService.get(ctx, (input as { pipelineId: string }).pipelineId),
};

export const getDeal: McpToolDefinition = {
  name: 'get_deal',
  description: 'Fetch a single deal by id.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({ dealId: z.string().uuid() }),
  run: (ctx, input) => dealService.get(ctx, (input as { dealId: string }).dealId),
};

export const getForecast: McpToolDefinition = {
  name: 'get_forecast',
  description:
    'Weighted pipeline forecast bucketed by expected-close month. Closed-won deals contribute full value; open deals contribute value × probability.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    pipelineId: z.string().uuid().optional(),
    startMonth: z.string().date().optional(),
    endMonth: z.string().date().optional(),
  }),
  run: (ctx, input) =>
    dealService.forecast(ctx, input as Parameters<typeof dealService.forecast>[1]),
};

export const getTasks: McpToolDefinition = {
  name: 'get_tasks',
  description: 'List tasks, optionally filtered by assignee / customer / deal / status.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    assignedToUserId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
    status: z.enum(['open', 'completed', 'cancelled']).optional(),
    take: z.number().int().min(1).max(100).optional().default(25),
  }),
  run: (ctx, input) => taskService.list(ctx, input as Parameters<typeof taskService.list>[1]),
};

export const getTodayTasks: McpToolDefinition = {
  name: 'get_today_tasks',
  description: 'Open tasks due today (or earlier) for the supplied user.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({ userId: z.string().uuid() }),
  run: (ctx, input) =>
    taskService.getTodayForUser(ctx, { userId: (input as { userId: string }).userId }),
};

export const getSegments: McpToolDefinition = {
  name: 'get_segments',
  description: 'List active segments for the tenant.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    includeArchived: z.boolean().optional().default(false),
  }),
  run: (ctx, input) => segmentService.list(ctx, input as Parameters<typeof segmentService.list>[1]),
};

export const getSegmentMembers: McpToolDefinition = {
  name: 'get_segment_members',
  description: 'List the customers currently in a segment.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    segmentId: z.string().uuid(),
    limit: z.number().int().min(1).max(1000).optional().default(100),
  }),
  run: (ctx, input) => {
    const { segmentId, limit } = input as { segmentId: string; limit: number };
    return segmentService.members(ctx, segmentId, { limit });
  },
};

export const getActivityFeed: McpToolDefinition = {
  name: 'get_crm_activity_feed',
  description:
    'Recent CRM activity for the tenant. Filterable by customer or deal; defaults to the tenant-wide feed.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    customerId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
    take: z.number().int().min(1).max(100).optional().default(25),
  }),
  run: (ctx, input) => activityService.list(ctx, input),
};

export const getOrder: McpToolDefinition = {
  name: 'get_order',
  description: 'Fetch a single order by id, including items.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({ orderId: z.string().uuid() }),
  run: (ctx, input) => orderService.get(ctx, (input as { orderId: string }).orderId),
};

export const getQuote: McpToolDefinition = {
  name: 'get_quote',
  description: 'Fetch a single quote by id, including items + lifecycle status.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({ quoteId: z.string().uuid() }),
  run: (ctx, input) => quoteService.get(ctx, (input as { quoteId: string }).quoteId),
};

export const getCrmMetrics: McpToolDefinition = {
  name: 'get_crm_metrics',
  description:
    'Tenant-wide CRM snapshot: customer + B2B counts, open deals + pipeline value, open + overdue tasks, active segments.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({}),
  run: (ctx) => reportingService.tenantSnapshot(ctx),
};

export const getPipelineFunnel: McpToolDefinition = {
  name: 'get_pipeline_funnel',
  description: 'Deal counts + summed value per stage for one pipeline.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({ pipelineId: z.string().uuid() }),
  run: (ctx, input) =>
    reportingService.pipelineFunnel(ctx, (input as { pipelineId: string }).pipelineId),
};

export const getWinLossByRep: McpToolDefinition = {
  name: 'get_win_loss_by_rep',
  description:
    'Won/lost/open deal counts and won revenue by assigned rep, optionally scoped to a pipeline.',
  scope: 'read:crm',
  confirmation: false,
  input: z.object({
    pipelineId: z.string().uuid().optional(),
    sinceDays: z.number().int().min(1).max(3650).optional(),
  }),
  run: (ctx, input) => {
    const { sinceDays, pipelineId } = input as {
      sinceDays?: number;
      pipelineId?: string;
    };
    return reportingService.winLossByRep(ctx, {
      pipelineId,
      since: sinceDays ? new Date(Date.now() - sinceDays * 86_400_000) : undefined,
    });
  },
};

export const readTools = [
  getCustomers,
  getCustomer,
  getTopCustomers,
  getInactiveCustomers,
  getB2bAccounts,
  getPipeline,
  getDeal,
  getForecast,
  getTasks,
  getTodayTasks,
  getSegments,
  getSegmentMembers,
  getActivityFeed,
  getOrder,
  getQuote,
  getCrmMetrics,
  getPipelineFunnel,
  getWinLossByRep,
];
