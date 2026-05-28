// CRM Server Actions — barrel.
//
// Each domain has its own `'use server'` module (customer-actions,
// deal-actions, order-actions, etc.). This barrel re-exports them so
// existing imports keep working while each file stays under the 200-line
// target. Locked decision #6 (module gate) and #7 (one service layer,
// three transports) are enforced inside `_action-helpers.runAction`.

export type { ActionResult } from './_action-helpers';

export * from './customer-actions';
export * from './deal-actions';
export * from './activity-task-actions';
export * from './order-actions';
export * from './order-payments-actions';
export * from './order-fulfillment-actions';
export * from './quote-actions';
export * from './pipeline-actions';
