// Site Builder MCP tool registry.
//
// Each tool is a thin wrapper over a service function (one service, many
// transports). The MCP server imports `sitebuilderMcpTools` and exposes them;
// REST exercises the same service functions. Mirrors packages/crm/src/mcp/registry.ts.

import type { z } from 'zod';
import type { ServiceContext } from '../errors';

export type McpScope = 'read:storefront' | 'write:storefront';

export interface McpToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  scope: McpScope;
  input: z.ZodType<TInput>;
  /** Destructive/go-live writes — the MCP server surfaces a confirmation
   *  prompt before invoking. */
  confirmation: boolean;
  run(ctx: ServiceContext, input: TInput): Promise<TOutput>;
}

export type AnyMcpTool = McpToolDefinition<unknown, unknown>;
