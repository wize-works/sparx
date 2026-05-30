// Typed errors for the customer-auth surface. The api-rest route layer maps
// these to the platform error envelope (docs/06 §4) — never leak raw messages
// that would aid account enumeration (the service is already enumeration-safe;
// these codes are for legitimate, non-leaky failures like a weak password).

export type CustomerAuthErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'INVALID_INPUT'
  | 'INVALID_TOKEN';

export class CustomerAuthError extends Error {
  readonly code: CustomerAuthErrorCode;

  constructor(code: CustomerAuthErrorCode, message: string) {
    super(message);
    this.name = 'CustomerAuthError';
    this.code = code;
    // Preserve `instanceof` across module/bundler boundaries.
    Object.setPrototypeOf(this, CustomerAuthError.prototype);
  }
}
