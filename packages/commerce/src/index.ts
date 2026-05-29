// @sparx/commerce — public package barrel.
//
// Re-exports the service layer plus the shared types REST/GraphQL/MCP/
// Server Actions consume. Per locked decision #7 (mirrored from CRM:
// one service layer, many transports), every external write into
// Commerce goes through one of the services here.

export * from './services';
export * from './events';
export * as commerceMcp from './mcp';
export { commerceMcpTools } from './mcp';
export type { AnyMcpTool, McpScope, McpToolDefinition } from './mcp';
export type { ServiceContext } from './errors';
export {
  CommerceConflictError,
  CommerceNotFoundError,
  CommerceOutOfStockError,
  CommercePricingError,
  CommerceProviderError,
  CommerceValidationError,
} from './errors';
export { writeAuditLog } from './audit';
