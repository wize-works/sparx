// Email MCP tool registry.
//
// Each tool is a thin wrapper over an email-platform service function (one
// service layer, many transports — mirrors @sparx/crm). Read tools are open;
// write tools that send mail are confirmation-gated so the MCP server surfaces
// an explicit user OK before a broadcast goes out.

import type { z } from 'zod';

import type { ServiceContext } from '../errors';

export type McpScope = 'read:email' | 'write:email' | 'write:email_bulk';

export interface McpToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  scope: McpScope;
  input: z.ZodType<TInput>;
  /** When true, the MCP server must surface a confirmation prompt before run. */
  confirmation: boolean;
  run(ctx: ServiceContext, input: TInput): Promise<TOutput>;
}

export type AnyMcpTool = McpToolDefinition<unknown, unknown>;
