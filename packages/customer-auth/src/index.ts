// @sparx/customer-auth — Layer-2 storefront shopper authentication.
// Server-only; consumed by api-rest's public account routes. The storefront
// never imports this directly (it talks to api-rest). See docs/27.

export {
  registerCustomer,
  authenticateCustomer,
  verifyCustomerSession,
  revokeCustomerSession,
  requestPasswordReset,
  resetPassword,
  type CustomerAuthContext,
  type SessionMeta,
  type IssuedSession,
  type VerifiedSession,
  type ResetRequest,
} from './service';

export { CustomerAuthError, type CustomerAuthErrorCode } from './errors';

export {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_SECONDS,
  RESET_TTL_SECONDS,
} from './session';

export { hashPassword, verifyPassword } from './hash';
