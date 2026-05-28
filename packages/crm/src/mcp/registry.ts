// CRM MCP tool registry.
//
// Each tool is a thin wrapper over a function in the service layer. Per
// locked decision #7 (one service layer, three transports), the MCP server
// imports these tool definitions and exposes them; REST/GraphQL exercise
// the same underlying service functions. A bug fixed in
// customerService.list() is fixed in the MCP `get_customers` tool
// automatically.
//
// Each tool declares:
//   • name (the MCP-visible identifier)
//   • description (LLM-facing — surfaces in tool catalog)
//   • scope (matches the API-key scopes from docs/07 §5)
//   • input (Zod schema for the tool's arguments)
//   • run (handler that calls the service)
//   • confirmation (true for bulk writes — the MCP server gates these
//     behind an explicit user OK per docs/07 §5)
//
// The MCP server (`services/mcp-server` — Phase 6.b) imports `crmMcpTools`,
// translates each tool spec into the @modelcontextprotocol/sdk shape, and
// publishes them.

import type { z } from 'zod';

import type { ServiceContext } from '../errors';

export type McpScope = 'read:crm' | 'write:crm' | 'write:crm_bulk';

export interface McpToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  scope: McpScope;
  input: z.ZodType<TInput>;
  /** Bulk writes — the MCP server must surface a confirmation prompt to
   *  the user before invoking. */
  confirmation: boolean;
  run(ctx: ServiceContext, input: TInput): Promise<TOutput>;
}

/** Helper for downstream code that wants a typed entry without losing the
 *  TInput/TOutput pair. */
export type AnyMcpTool = McpToolDefinition<unknown, unknown>;
