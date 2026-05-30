// CRM Server Actions — barrel.
//
// Each domain has its own `'use server'` module (customer-actions,
// deal-actions, order-actions, etc.). This barrel re-exports them so
// existing imports keep working while each file stays under the 200-line
// target. The CRM module gate (locked decision #6) is now enforced by
// api-rest (`requireCrmModule` per route); each action is a thin POST/
// PATCH against /v1/crm/* via `_rest-action.ts`.

export type { ActionResult } from './_action-helpers';

export * from './customer-actions';
export * from './deal-actions';
export * from './activity-task-actions';
export * from './order-actions';
export * from './order-payments-actions';
export * from './order-fulfillment-actions';
export * from './quote-actions';
export * from './pipeline-actions';
export * from './b2b-actions';
export * from './segment-actions';
