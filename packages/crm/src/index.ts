// Sparx CRM — public package barrel.
//
// Re-exports the service layer plus the shared types REST/GraphQL/MCP
// transports use. Per the locked decision #7 (one service layer, three
// transports), every external write into the CRM goes through one of the
// services here.

export * from './services/index.js';
export * from './events.js';
export * from './consumers/index.js';
export type { ServiceContext, NotFoundError, ValidationError } from './errors.js';
export { CrmNotFoundError, CrmValidationError, CrmConflictError } from './errors.js';
