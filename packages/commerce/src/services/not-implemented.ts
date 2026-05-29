// Phase 0 service-layer placeholder.
//
// Every service function exported from this package is wired to real
// Prisma queries in Phase 1+. Until the corresponding migration lands,
// callers (REST routes, server actions, MCP tools, storefront) can
// still compile against the typed signatures — but a runtime call
// rejects with this error. The error code surfaces as 501 /
// NOT_IMPLEMENTED in every transport.

export class CommerceNotImplementedError extends Error {
  readonly code = 'NOT_IMPLEMENTED' as const;
  readonly serviceFn: string;
  constructor(serviceFn: string) {
    super(`${serviceFn} is not yet implemented (Commerce Phase 0 scaffold)`);
    this.serviceFn = serviceFn;
  }
}

/** For async functions (the vast majority of service surfaces). Returns
 *  a rejected promise so the function signature can stay `Promise<T>`
 *  without forcing an `async` keyword that ESLint's require-await rule
 *  would flag. */
export function notImplemented(serviceFn: string): Promise<never> {
  return Promise.reject(new CommerceNotImplementedError(serviceFn));
}

/** For synchronous helpers — throws. Rare. */
export function notImplementedSync(serviceFn: string): never {
  throw new CommerceNotImplementedError(serviceFn);
}
