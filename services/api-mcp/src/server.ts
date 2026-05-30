// Per-request McpServer factory.
//
// MCP's StreamableHTTPServerTransport is connection-scoped, but we want
// per-request tenant context. Stateless mode + a fresh McpServer per HTTP
// request is the simplest correct approach: each request authenticates,
// builds an McpServer with handlers closing over the tenant context, then
// connects + dispatches once.
//
// Each tool definition from `@sparx/crm`'s `crmMcpTools` is registered with
// the SDK's `registerTool`. Scope is checked before dispatch — a tool whose
// scope isn't in the caller's grant set returns an error result (the LLM
// can see why and reroute). Confirmation:true tools surface the
// `destructiveHint` annotation so the MCP client can prompt the user.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpAuthContext } from './auth.js';
import { recordToolInvocation } from './audit.js';
import { ALL_MCP_TOOLS, type AnyMcpTool } from './tool-registry.js';

const SERVER_INFO = { name: 'sparx-mcp', version: '1.0.0' } as const;

export function buildServerForRequest(auth: McpAuthContext): McpServer {
  const server = new McpServer(SERVER_INFO);

  for (const tool of ALL_MCP_TOOLS) {
    // ZodObject is `AnySchema`-compatible — pass it through so the SDK can
    // derive the JSON-schema for the client without us re-deriving the shape.
    const inputSchema = tool.input as Parameters<typeof server.registerTool>[1]['inputSchema'];
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema,
        annotations: {
          // confirmation:true tools mutate state in a way that needs user
          // acknowledgement before invocation. The destructiveHint tells
          // MCP clients (Claude desktop, ChatGPT) to prompt.
          destructiveHint: tool.confirmation,
          openWorldHint: !tool.scope.startsWith('read:'),
        },
      },
      (async (input: unknown) => dispatch(tool, auth, input)) as Parameters<
        typeof server.registerTool
      >[2]
    );
  }

  return server;
}

async function dispatch(
  tool: AnyMcpTool,
  auth: McpAuthContext,
  input: unknown
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  if (!auth.scopes.has(tool.scope)) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `forbidden: tool "${tool.name}" requires scope "${tool.scope}" which is not granted`,
        },
      ],
    };
  }

  const ctx = { tenantId: auth.tenantId, userId: auth.userId };
  try {
    const parsed = tool.input.parse(input);
    const result = await tool.run(ctx, parsed);
    void recordToolInvocation({
      tenantId: auth.tenantId,
      userId: auth.userId,
      toolName: tool.name,
      input: parsed,
      outcome: 'success',
    });
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void recordToolInvocation({
      tenantId: auth.tenantId,
      userId: auth.userId,
      toolName: tool.name,
      input,
      outcome: 'error',
      errorMessage: message,
    });
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}
