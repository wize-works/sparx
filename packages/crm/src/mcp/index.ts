// CRM MCP tool registry barrel.
//
// `crmMcpTools` is the array the MCP server iterates to register tools.
// Each tool is a thin wrapper over a service function (locked decision #7).
// Read tools open; write tools confirmation-gated; bulk writes get the
// stricter 'write:crm_bulk' scope.

export type { McpScope, McpToolDefinition, AnyMcpTool } from './registry';

import { readTools } from './read-tools';
import { writeTools } from './write-tools';

export * from './read-tools';
export * from './write-tools';

/** The full CRM tool set the MCP server publishes. */
export const crmMcpTools = [...readTools, ...writeTools];
