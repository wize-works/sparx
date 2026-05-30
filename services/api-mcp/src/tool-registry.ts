// The merged MCP tool registry across modules, plus small lookup helpers that
// don't need the SDK. Kept separate from server.ts so the rate limiter can ask
// "is this a write tool call?" without pulling in the SDK.

import type { z } from 'zod';
import { crmMcpTools } from '@sparx/crm';
import { sitebuilderMcpTools } from '@sparx/sitebuilder';

// Structural type spanning every module's tool definition. Each module declares
// its own scope union; here we only need the shared shape (scope is a string).
export interface AnyMcpTool {
  name: string;
  description: string;
  scope: string;
  input: z.ZodType;
  confirmation: boolean;
  run(ctx: { tenantId: string; userId: string }, input: unknown): Promise<unknown>;
}

// Every tool the MCP server publishes. Add a module's tool array here to expose
// it. Same service layer the REST transport uses (one service, many transports).
export const ALL_MCP_TOOLS: AnyMcpTool[] = [
  ...(crmMcpTools as unknown as AnyMcpTool[]),
  ...(sitebuilderMcpTools as unknown as AnyMcpTool[]),
];

const WRITE_SCOPES: ReadonlySet<string> = new Set([
  'write:crm',
  'write:crm_bulk',
  'write:storefront',
]);

const TOOLS_BY_NAME: ReadonlyMap<string, AnyMcpTool> = new Map(
  ALL_MCP_TOOLS.map((t) => [t.name, t])
);

/** True when `body` is a JSON-RPC `tools/call` for a write-scope tool.
 *  Anything else (initialize, tools/list, read-scope calls, unknown names)
 *  returns false so it counts only against the per-minute / per-day quotas. */
export function isWriteToolCall(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { method?: unknown; params?: unknown };
  if (b.method !== 'tools/call') return false;
  const params = b.params as { name?: unknown } | undefined;
  const name = typeof params?.name === 'string' ? params.name : null;
  if (!name) return false;
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) return false;
  return WRITE_SCOPES.has(tool.scope);
}
