// Read-only email MCP tools. Scope: 'read:email'. No confirmation.

import { z } from 'zod';

import * as analyticsService from '../services/analytics-service';
import * as automationService from '../services/automation-service';
import * as broadcastService from '../services/broadcast-service';
import * as suppressionService from '../services/suppression-service';
import type { McpToolDefinition } from './registry';

export const getEmailStats: McpToolDefinition = {
  name: 'get_email_stats',
  description:
    'Email engagement over the last N days (accepted, delivered, opened, clicked, bounced, complaints, unsubscribes) plus recent activity.',
  scope: 'read:email',
  confirmation: false,
  input: z.object({ days: z.number().int().min(1).max(365).optional() }),
  run: (ctx, input) => analyticsService.overview(ctx, (input as { days?: number }).days ?? 30),
};

export const getAutomationList: McpToolDefinition = {
  name: 'get_automation_list',
  description: 'List the tenant’s email automations with their trigger, delay, and enabled state.',
  scope: 'read:email',
  confirmation: false,
  input: z.object({}),
  run: (ctx) => automationService.list(ctx),
};

export const listBroadcasts: McpToolDefinition = {
  name: 'list_broadcasts',
  description: 'List email broadcasts with their status and recipient counts.',
  scope: 'read:email',
  confirmation: false,
  input: z.object({}),
  run: (ctx) => broadcastService.list(ctx),
};

export const getUnsubscribedCustomers: McpToolDefinition = {
  name: 'get_unsubscribed_customers',
  description:
    'List suppressed addresses (unsubscribes, bounces, complaints, manual) — the do-not-send list.',
  scope: 'read:email',
  confirmation: false,
  input: z.object({
    scope: z.enum(['transactional', 'marketing', 'all']).optional(),
    q: z.string().max(255).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  }),
  run: (ctx, input) => suppressionService.list(ctx, input),
};

export const readTools: McpToolDefinition[] = [
  getEmailStats,
  getAutomationList,
  listBroadcasts,
  getUnsubscribedCustomers,
];
