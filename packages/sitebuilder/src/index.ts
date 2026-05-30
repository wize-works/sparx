// @sparx/sitebuilder — public package barrel.
//
// The service layer is the single source of truth shared by REST, MCP, and
// Server Actions (one service, many transports). The dashboard imports the
// manifest via `@sparx/sitebuilder/manifest`.

export * from './services/index';
export * from './events';
export * as sitebuilderMcp from './mcp';
export { sitebuilderMcpTools } from './mcp';
export type { AnyMcpTool, McpScope, McpToolDefinition } from './mcp';
export type { ServiceContext, NotFoundError, ValidationError } from './errors';
export {
  SitebuilderNotFoundError,
  SitebuilderValidationError,
  SitebuilderConflictError,
} from './errors';
