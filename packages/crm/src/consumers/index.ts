// CRM event consumers — public surface.
//
// The bootstrap (`registerCrmConsumers`) wires every consumer's handler to
// the platform bus, with the per-tenant module gate baked in. Tests inject
// a fresh in-memory bus via `resetPlatformBusForTesting()` so each suite
// gets isolated dispatch.

export { registerCrmConsumers, gateHandler } from './registry.js';
export type { RegisterOptions, ConsumerRegistration, ConsumerContext } from './registry.js';

export {
  getPlatformBus,
  setPlatformBus,
  resetPlatformBusForTesting,
} from './platform-bus.js';
export type { PlatformEvent, PlatformEventBus, PlatformEventHandler } from './platform-bus.js';

export {
  getDedupeStore,
  setDedupeStore,
  resetDedupeForTesting,
} from './dedupe.js';
export type { DedupeStore } from './dedupe.js';

export {
  buildCustomerProjection,
  projectionFromCustomer,
  resolveCustomerByAuthUserId,
} from './projection.js';
export type { CustomerProjection } from './projection.js';

export { resolveCustomerByEmail } from './resolve.js';

export { ORDER_CONSUMER_TOPICS, type OrderCreatedEventPayload } from './order-events.js';
export { EMAIL_CONSUMER_TOPICS } from './email-events.js';
export { QUOTE_CONSUMER_TOPICS } from './quote-events.js';
export { AUTH_CONSUMER_TOPICS } from './auth-events.js';
