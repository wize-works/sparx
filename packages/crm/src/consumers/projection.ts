// Customer projection — the snapshot of fields any consumer or segment rule
// might read about a customer.
//
// The projection is the boundary between "what the database stores" and
// "what consumers reason about." Segment rules read FROM the projection,
// not from raw Customer rows, so adding a denormalized stat (e.g. lifetime
// email-open count) is a projection change — segments don't move with the
// schema. The same projection feeds the Phase 4 segment evaluator and
// today's activity-decoration code, so they're always consistent.
//
// Built from a single tenant-scoped query per call. We could memoize within
// a single event-dispatch batch but premature — every event invalidates the
// snapshot anyway.

import { withTenant } from '@sparx/db';
import type { Customer } from '@sparx/db';

import type { ServiceContext } from '../errors.js';
import { CrmNotFoundError } from '../errors.js';

export interface CustomerProjection {
  customerId: string;
  tenantId: string;
  type: 'prospect' | 'retail' | 'b2b';
  authUserId: string | null;
  b2bAccountId: string | null;
  assignedRepId: string | null;
  email: string | null;
  doNotContact: boolean;
  tags: readonly string[];

  // Commerce-derived denormalizations. Updated by the order-event consumer.
  totalSpent: number; // decimal flattened to JS number — fine for predicate eval
  orderCount: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  daysSinceLastOrder: number | null;

  // Lifecycle markers.
  createdAt: Date;
  daysSinceCreated: number;

  // Read-side flags computed from raw fields. Saves rules a lookup hop.
  hasOrdered: boolean;
  isHighValue: boolean; // totalSpent > 5000 by default; thresholding lives in segment rules later
  isInactive: boolean; // 90+ days since last order, has ordered before

  // Engagement counters — populated lazily by the engagement aggregator
  // (Phase 4). Default 0 so segment rules can reference them safely now.
  emailOpens30d: number;
  emailClicks30d: number;
}

const HIGH_VALUE_DEFAULT = 5_000;
const INACTIVE_DAYS_DEFAULT = 90;

/** Build a projection for a single customer. Throws NOT_FOUND if the
 *  customer is missing, soft-deleted, or belongs to a different tenant
 *  (the RLS check fires before this function ever sees the row). */
export async function buildCustomerProjection(
  ctx: ServiceContext,
  customerId: string
): Promise<CustomerProjection> {
  const customer = await withTenant(ctx, (tx) =>
    tx.customer.findUnique({ where: { id: customerId } })
  );
  if (!customer || customer.deletedAt !== null) {
    throw new CrmNotFoundError('Customer', customerId);
  }
  return projectionFromCustomer(customer);
}

/** Build a projection from an already-fetched Customer row. Used by callers
 *  that already loaded the row (e.g. the merge service after fetching the
 *  primary). Saves a round-trip — same result either way. */
export function projectionFromCustomer(customer: Customer): CustomerProjection {
  const now = Date.now();
  const lastOrderMs = customer.lastOrderAt?.getTime() ?? null;
  const daysSinceLastOrder =
    lastOrderMs === null ? null : Math.floor((now - lastOrderMs) / 86_400_000);
  const daysSinceCreated = Math.floor((now - customer.createdAt.getTime()) / 86_400_000);
  const totalSpent = Number(customer.totalSpent);

  return {
    customerId: customer.id,
    tenantId: customer.tenantId,
    type: customer.type as 'prospect' | 'retail' | 'b2b',
    authUserId: customer.authUserId,
    b2bAccountId: customer.b2bAccountId,
    assignedRepId: customer.assignedRepId,
    email: customer.email,
    doNotContact: customer.doNotContact,
    tags: customer.tags,
    totalSpent,
    orderCount: customer.orderCount,
    firstOrderAt: customer.firstOrderAt,
    lastOrderAt: customer.lastOrderAt,
    daysSinceLastOrder,
    createdAt: customer.createdAt,
    daysSinceCreated,
    hasOrdered: customer.orderCount > 0,
    isHighValue: totalSpent >= HIGH_VALUE_DEFAULT,
    isInactive:
      customer.orderCount > 0 &&
      daysSinceLastOrder !== null &&
      daysSinceLastOrder >= INACTIVE_DAYS_DEFAULT,
    emailOpens30d: 0,
    emailClicks30d: 0,
  };
}

/** Locate the customer row a platform event refers to. Order/quote events
 *  carry the customerId directly; auth events carry an authUserId and we
 *  resolve via the FK. Returns null if no customer is linked yet (guest
 *  checkouts where the row was created lazily but auth registration
 *  happened on a different platform), letting the consumer no-op gracefully. */
export async function resolveCustomerByAuthUserId(
  ctx: ServiceContext,
  authUserId: string
): Promise<Customer | null> {
  return withTenant(ctx, (tx) =>
    tx.customer.findFirst({
      where: { authUserId, deletedAt: null },
    })
  );
}
