// Small lookup helpers around the CRM tool registry that don't need the
// full @sparx/crm import surface. Kept separate from server.ts so the rate
// limiter can ask "is this a write tool call?" without pulling in the SDK.

import { crmMcpTools, type AnyMcpTool } from '@sparx/crm';

const WRITE_SCOPES: ReadonlySet<string> = new Set(['write:crm', 'write:crm_bulk']);

const TOOLS_BY_NAME: ReadonlyMap<string, AnyMcpTool> = new Map(
  (crmMcpTools as AnyMcpTool[]).map((t) => [t.name, t])
);

/** True when `body` is a JSON-RPC `tools/call` for a write-scope tool.
 *  Anything else (initialize, tools/list, calls into a read-scope tool,
 *  unknown tool names) returns false so it counts only against the
 *  per-minute / per-day quotas, not the write bucket. */
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
