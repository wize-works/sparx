// Commerce MCP tool registry barrel.
//
// `commerceMcpTools` is the array the MCP server iterates to register
// commerce-side tools alongside `crmMcpTools`. Each tool is a thin
// wrapper over a service-layer function — fix once, fix everywhere.

export type { McpScope, McpToolDefinition, AnyMcpTool } from './registry';

import { readTools } from './read-tools';
import { writeTools } from './write-tools';

export * from './read-tools';
export * from './write-tools';

/** The full Commerce tool set the MCP server publishes. */
export const commerceMcpTools = [...readTools, ...writeTools];
