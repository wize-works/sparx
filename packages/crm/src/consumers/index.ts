// CRM event consumers — public surface.
//
// The bootstrap (`registerCrmConsumers`) wires every consumer's handler to
// the platform bus, with the per-tenant module gate baked in. Tests inject
// a fresh in-memory bus via `resetPlatformBusForTesting()` so each suite
// gets isolated dispatch.

export { registerCrmConsumers, gateHandler } from './registry';
export type { RegisterOptions, ConsumerRegistration, ConsumerContext } from './registry';

export {
  getPlatformBus,
  setPlatformBus,
  resetPlatformBusForTesting,
  publishPlatformEvent,
} from './platform-bus';
export type { PlatformEvent, PlatformEventBus, PlatformEventHandler } from './platform-bus';

export { getDedupeStore, setDedupeStore, resetDedupeForTesting } from './dedupe';
export type { DedupeStore } from './dedupe';

export {
  buildCustomerProjection,
  projectionFromCustomer,
  resolveCustomerByAuthUserId,
} from './projection';
export type { CustomerProjection } from './projection';

export { resolveCustomerByEmail } from './resolve';

export { registerSegmentEvaluatorConsumers, evaluateCustomerForTenant } from './segment-evaluator';
export { buildSegmentRuleProjection } from './segment-projection';

export { ORDER_CONSUMER_TOPICS, type OrderCreatedEventPayload } from './order-events';
export { EMAIL_CONSUMER_TOPICS } from './email-events';
export { QUOTE_CONSUMER_TOPICS } from './quote-events';
export { AUTH_CONSUMER_TOPICS } from './auth-events';
