// Email-platform input/validation schemas (Zod) + inferred types.
//
// Co-located with the service rather than a separate @sparx/email-schemas
// package: the dashboard validates server-side through api-rest, so these are
// consumed by the service + REST layer, not shipped to the browser. Extract a
// dedicated package only if client-side schema sharing becomes necessary.

export * from './settings';
export * from './domains';
export * from './suppressions';
export * from './templates';
export * from './automations';
