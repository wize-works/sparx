// Write MCP tools. Scope: 'write:crm' or 'write:crm_bulk'. All confirm.
// Bulk-modifying tools (bulk_assign_customers, bulk_tag_customers) need
// 'write:crm_bulk' which the MCP server treats as a stricter scope.

import { z } from 'zod';

import {
  activityService,
  customerService,
  dealService,
  taskService,
  quoteLifecycleService,
} from '../services';

import type { McpToolDefinition } from './registry';

export const addActivity: McpToolDefinition = {
  name: 'add_crm_activity',
  description:
    'Record a CRM activity (note / call / meeting) on a customer or deal. Activities are append-only — corrections insert a new row pointing at the original.',
  scope: 'write:crm',
  confirmation: true,
  input: z.object({
    customerId: z.string().uuid().nullable().optional(),
    dealId: z.string().uuid().nullable().optional(),
    type: z.enum(['note', 'call', 'meeting']),
    description: z.string().max(10_000),
  }),
  run: (ctx, input) => activityService.record(ctx, input),
};

export const createTask: McpToolDefinition = {
  name: 'create_task',
  description: 'Create a follow-up task assigned to a teammate.',
  scope: 'write:crm',
  confirmation: true,
  input: z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(10_000).optional(),
    dueAt: z.string().datetime().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
    assignedToUserId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
    dealId: z.string().uuid().optional(),
  }),
  run: (ctx, input) => taskService.create(ctx, input),
};

export const completeTask: McpToolDefinition = {
  name: 'complete_task',
  description: 'Mark a task complete.',
  scope: 'write:crm',
  confirmation: true,
  input: z.object({ taskId: z.string().uuid() }),
  run: (ctx, input) => taskService.complete(ctx, input),
};

export const bulkAssignCustomers: McpToolDefinition = {
  name: 'bulk_assign_customers',
  description:
    'Bulk-assign a rep to a list of customers. Bulk write — the MCP server confirms with the user first.',
  scope: 'write:crm_bulk',
  confirmation: true,
  input: z.object({
    customerIds: z.array(z.string().uuid()).min(1).max(500),
    assignedRepId: z.string().uuid().nullable(),
  }),
  run: async (ctx, input) => {
    const { customerIds, assignedRepId } = input as {
      customerIds: string[];
      assignedRepId: string | null;
    };
    const results = [];
    for (const id of customerIds) {
      results.push(await customerService.update(ctx, id, { assignedRepId }));
    }
    return { updated: results.length };
  },
};

export const bulkTagCustomers: McpToolDefinition = {
  name: 'bulk_tag_customers',
  description: 'Bulk-add tags to customers. Existing tags are preserved.',
  scope: 'write:crm_bulk',
  confirmation: true,
  input: z.object({
    customerIds: z.array(z.string().uuid()).min(1).max(500),
    addTags: z.array(z.string().min(1).max(63)).min(1).max(20),
  }),
  run: async (ctx, input) => {
    const { customerIds, addTags } = input as {
      customerIds: string[];
      addTags: string[];
    };
    let updated = 0;
    for (const id of customerIds) {
      const customer = await customerService.get(ctx, id);
      const next = Array.from(new Set([...customer.tags, ...addTags]));
      await customerService.update(ctx, id, { tags: next });
      updated += 1;
    }
    return { updated };
  },
};

export const moveDealStage: McpToolDefinition = {
  name: 'move_deal_stage',
  description:
    'Move a deal to a new stage in the same pipeline. Emits crm.deal.stage_changed; the email automation engine subscribes to it.',
  scope: 'write:crm',
  confirmation: true,
  input: z.object({
    dealId: z.string().uuid(),
    toStageId: z.string().uuid(),
    closedReason: z.string().max(500).optional(),
  }),
  run: (ctx, input) => {
    const { dealId, ...rest } = input as {
      dealId: string;
      toStageId: string;
      closedReason?: string;
    };
    return dealService.moveStage(ctx, dealId, rest);
  },
};

export const createDeal: McpToolDefinition = {
  name: 'create_deal',
  description: 'Open a new sales deal on a pipeline.',
  scope: 'write:crm',
  confirmation: true,
  input: z.object({
    pipelineId: z.string().uuid(),
    stageId: z.string().uuid(),
    title: z.string().min(1).max(255),
    value: z.number().min(0).optional().default(0),
    probability: z.number().min(0).max(100).optional().default(0),
    customerId: z.string().uuid().optional(),
    b2bAccountId: z.string().uuid().optional(),
    assignedRepId: z.string().uuid().optional(),
    expectedCloseDate: z.string().date().optional(),
  }),
  run: (ctx, input) => dealService.create(ctx, input),
};

export const convertQuote: McpToolDefinition = {
  name: 'convert_quote_to_order',
  description:
    'Convert an accepted quote into a new Order. Items + header values are snapshotted at conversion time.',
  scope: 'write:crm',
  confirmation: true,
  input: z.object({
    quoteId: z.string().uuid(),
    customerId: z.string().uuid().optional(),
  }),
  run: (ctx, input) => quoteLifecycleService.convertToOrder(ctx, input),
};

export const writeTools = [
  addActivity,
  createTask,
  completeTask,
  bulkAssignCustomers,
  bulkTagCustomers,
  moveDealStage,
  createDeal,
  convertQuote,
];
