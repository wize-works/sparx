// Commerce MCP tool registry. Mirrors @sparx/crm/mcp/registry — same
// shape, separate scope vocabulary so the MCP server can enforce
// commerce-only API key permissions.

import type { z } from 'zod';

import type { ServiceContext } from '../errors';

export type McpScope = 'read:commerce' | 'write:commerce' | 'write:commerce_bulk';

export interface McpToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  scope: McpScope;
  input: z.ZodType<TInput>;
  /** Mutating or bulk tools — the MCP server surfaces a confirmation
   *  prompt before invoking. */
  confirmation: boolean;
  run(ctx: ServiceContext, input: TInput): Promise<TOutput>;
}

export type AnyMcpTool = McpToolDefinition<unknown, unknown>;
