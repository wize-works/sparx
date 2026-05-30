// Site Builder MCP tool registry barrel. `sitebuilderMcpTools` is the array
// the MCP server iterates to register tools.

export type { McpScope, McpToolDefinition, AnyMcpTool } from './registry';

import { readTools } from './read-tools';
import { writeTools } from './write-tools';

export * from './read-tools';
export * from './write-tools';

export const sitebuilderMcpTools = [...readTools, ...writeTools];
