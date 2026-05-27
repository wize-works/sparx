// Default export is the server instance. Client-side code should import from
// '@sparx/auth/client' explicitly to keep the React/browser-only surface out
// of server bundles.

export { auth, type Auth } from './server.js';
export {
  signUpMerchant,
  SignUpError,
  type SignUpMerchantInput,
  type SignUpMerchantResult,
} from './sign-up.js';
