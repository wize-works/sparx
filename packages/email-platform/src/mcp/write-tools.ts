// Write email MCP tools. send_broadcast is confirmation-gated (it sends real
// mail); pause/resume toggle automations.

import { z } from 'zod';

import * as automationService from '../services/automation-service';
import * as broadcastService from '../services/broadcast-service';
import type { McpToolDefinition } from './registry';

export const sendBroadcast: McpToolDefinition = {
  name: 'send_broadcast',
  description:
    'Create and immediately send a broadcast to a CRM segment using an authored marketing template. Sends real email — always confirm the segment + recipient count first.',
  scope: 'write:email_bulk',
  confirmation: true,
  input: z.object({
    name: z.string().min(1).max(160),
    subject: z.string().min(1).max(255),
    templateId: z.string().uuid(),
    segmentId: z.string().uuid(),
    preheader: z.string().max(255).optional(),
  }),
  run: async (ctx, input) => {
    const args = input as {
      name: string;
      subject: string;
      templateId: string;
      segmentId: string;
      preheader?: string;
    };
    const broadcast = await broadcastService.create(ctx, args);
    return broadcastService.sendNow(ctx, broadcast.id);
  },
};

export const pauseAutomation: McpToolDefinition = {
  name: 'pause_automation',
  description: 'Disable an email automation by id (stops it from firing).',
  scope: 'write:email',
  confirmation: false,
  input: z.object({ automationId: z.string().uuid() }),
  run: (ctx, input) =>
    automationService.update(ctx, (input as { automationId: string }).automationId, {
      enabled: false,
    }),
};

export const resumeAutomation: McpToolDefinition = {
  name: 'resume_automation',
  description: 'Enable an email automation by id.',
  scope: 'write:email',
  confirmation: false,
  input: z.object({ automationId: z.string().uuid() }),
  run: (ctx, input) =>
    automationService.update(ctx, (input as { automationId: string }).automationId, {
      enabled: true,
    }),
};

export const writeTools: McpToolDefinition[] = [sendBroadcast, pauseAutomation, resumeAutomation];
