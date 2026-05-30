// Reaper for cart-soft reservations whose TTL has elapsed.
//
// Cart adds reserve stock for the TTL window (default 30 min); a forgotten
// tab would otherwise hold stock forever. inventoryService.expireDueReservations()
// flips matching rows to status='expired' and decrements allocated; this
// scheduler just calls it per active tenant on a schedule.

import { inventoryService } from '../services';

export interface ReaperResult {
  tenantId: string;
  released: number;
}

export async function reapExpiredReservations(input: { tenantId: string }): Promise<ReaperResult> {
  const { released } = await inventoryService.expireDueReservations({ tenantId: input.tenantId });
  return { tenantId: input.tenantId, released };
}
