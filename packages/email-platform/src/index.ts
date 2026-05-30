// Sparx Email Platform — public package barrel.
//
// Re-exports the service layer plus the shared error/event vocabulary the
// REST/MCP/Server-Action transports consume. Every external write into the
// email management surface goes through a service here (one service layer,
// many transports — mirrors @sparx/crm).

export * from './services/index';
export * from './events';
export type { ServiceContext, NotFoundError, ValidationError } from './errors';
export {
  EmailNotFoundError,
  EmailValidationError,
  EmailConflictError,
  EmailProviderError,
} from './errors';
