// Sparx CRM — public package barrel.
//
// Re-exports the service layer plus the shared types REST/GraphQL/MCP
// transports use. Per the locked decision #7 (one service layer, three
// transports), every external write into the CRM goes through one of the
// services here.

export * from './services/index';
export * from './events';
export * from './consumers/index';
export * as crmMcp from './mcp';
// Re-export the MCP tool array + types at the top level so transports can
// `import { crmMcpTools, type McpScope } from '@sparx/crm'` without the
// `crmMcp.` namespace prefix.
export { crmMcpTools } from './mcp';
export type { AnyMcpTool, McpScope, McpToolDefinition } from './mcp';
export {
  WebhookFanoutPublisher,
  preconnectWebhookFanout,
  installCrmWebhookFanout,
} from './webhooks';
export * as crmSchedulers from './schedulers';
export type { ServiceContext, NotFoundError, ValidationError } from './errors';
export { CrmNotFoundError, CrmValidationError, CrmConflictError } from './errors';
