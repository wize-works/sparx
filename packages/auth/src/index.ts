// Default export is the server instance. Client-side code should import from
// '@sparx/auth/client' explicitly to keep the React/browser-only surface out
// of server bundles.

export { auth, type Auth } from './server';
export {
  signUpMerchant,
  SignUpError,
  type SignUpMerchantInput,
  type SignUpMerchantResult,
} from './sign-up';
export { getSession, requireSession, type SparxSession } from './session';
export {
  isModuleEnabled,
  requireModule,
  invalidateModuleCache,
  moduleDisabledEnvelope,
  ModuleDisabledError,
  type ModuleSlug,
} from './module-gate';
export {
  issueApiKey,
  verifyApiKey,
  listApiKeys,
  revokeApiKey,
  type IssueArgs,
  type IssuedKey,
  type VerifiedKey,
  type ApiKeySummary,
} from './api-keys';
