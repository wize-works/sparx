// Sparx CRM — public package barrel.
//
// Re-exports the service layer plus the shared types REST/GraphQL/MCP
// transports use. Per the locked decision #7 (one service layer, three
// transports), every external write into the CRM goes through one of the
// services here.

export * from './services/index';
export * from './events';
export * from './consumers/index';
export type { ServiceContext, NotFoundError, ValidationError } from './errors';
export { CrmNotFoundError, CrmValidationError, CrmConflictError } from './errors';
