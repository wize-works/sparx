// Tenant-scoped sequential record numbering for orders + quotes.
//
// Postgres SEQUENCE-per-tenant would be the textbook solution, but creating
// a sequence per tenant on tenant signup is operational overhead we don't
// need yet. Instead: numbers are derived from a count of existing rows for
// that tenant, then padded. Collisions are caught by the
// (tenant_id, order_number) / (tenant_id, quote_number) unique constraint —
// if a write loses the race, the caller retries with the next number.
//
// Numbers are not gap-free (cancellations leave gaps) but they ARE
// monotonic per tenant — sufficient for human-readable identifiers.

import type { TxClient } from '@sparx/db';

const ORDER_PREFIX = 'O';
const QUOTE_PREFIX = 'Q';
const PAD_LENGTH = 6; // O-000001, Q-000001

export async function nextOrderNumber(tx: TxClient, tenantId: string): Promise<string> {
  const count = await tx.order.count({ where: { tenantId } });
  return formatNumber(ORDER_PREFIX, count + 1);
}

export async function nextQuoteNumber(tx: TxClient, tenantId: string): Promise<string> {
  const count = await tx.quote.count({ where: { tenantId } });
  return formatNumber(QUOTE_PREFIX, count + 1);
}

function formatNumber(prefix: string, value: number): string {
  return `${prefix}-${value.toString().padStart(PAD_LENGTH, '0')}`;
}
