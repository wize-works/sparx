// Scheduled automation triggers.
//
// Functions in this file are designed to run on a daily Cloud Scheduler
// tick. Each surveys the database for "X just crossed a threshold" cases
// the email/notification engines want to react to, then emits the
// matching CRM events. Per locked decision #6, scheduling is gated by
// the per-tenant CRM activation — the runner walks the active-tenant
// list before calling each function.
//
// Event vocabulary (extends docs/11 §7):
//   • crm.customer.inactive          customer hasn't ordered in N days
//   • crm.customer.high_value        customer crossed totalSpent threshold
//   • crm.deal.close_date_approaching deal expectedCloseDate within N days
//   • crm.b2b.credit_near_limit       utilization ≥ threshold
//   • crm.quote.expiring              quote validUntil within N days
//
// We DO NOT also write CrmActivity rows here — that's the email/automation
// engine's job once it actually fires the message.

import { withTenant } from '@sparx/db';

import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';

export interface TriggerThresholds {
  /** Days without an order to flag a customer as inactive. */
  inactiveDays?: number;
  /** Total spent threshold for high-value crossing. */
  highValueAmount?: number;
  /** Days-until-expected-close inside which to flag a deal. */
  dealCloseSoonDays?: number;
  /** Credit utilization ratio (0–1) at which to flag the account. */
  creditUtilizationThreshold?: number;
  /** Days-until-valid-until inside which to flag a quote. */
  quoteExpirySoonDays?: number;
}

const DEFAULTS: Required<TriggerThresholds> = {
  inactiveDays: 90,
  highValueAmount: 5_000,
  dealCloseSoonDays: 7,
  creditUtilizationThreshold: 0.85,
  quoteExpirySoonDays: 7,
};

export interface TriggerSummary {
  inactive: number;
  highValue: number;
  dealsClosing: number;
  b2bCreditNearLimit: number;
  quotesExpiring: number;
}

/** Run every scheduled automation trigger for one tenant. Caller iterates
 *  CRM-active tenants and calls this once per tenant per tick (daily). */
export async function runDailyAutomationTriggers(
  ctx: ServiceContext,
  thresholds: TriggerThresholds = {}
): Promise<TriggerSummary> {
  const t = { ...DEFAULTS, ...thresholds };

  const [inactive, highValue, dealsClosing, b2bCreditNearLimit, quotesExpiring] = await Promise.all(
    [
      emitInactiveCustomers(ctx, t.inactiveDays),
      emitHighValueCrossings(ctx, t.highValueAmount),
      emitDealsClosingSoon(ctx, t.dealCloseSoonDays),
      emitB2bCreditNearLimit(ctx, t.creditUtilizationThreshold),
      emitQuotesExpiring(ctx, t.quoteExpirySoonDays),
    ]
  );

  return { inactive, highValue, dealsClosing, b2bCreditNearLimit, quotesExpiring };
}

async function emitInactiveCustomers(ctx: ServiceContext, days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  return withTenant(ctx, async (tx) => {
    const customers = await tx.customer.findMany({
      where: { deletedAt: null, lastOrderAt: { not: null, lt: cutoff } },
      select: { id: true, lastOrderAt: true },
      take: 5000,
    });
    for (const c of customers) {
      const daysInactive = Math.floor(
        (Date.now() - (c.lastOrderAt?.getTime() ?? Date.now())) / 86_400_000
      );
      await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.customer.updated',
        payload: { customerId: c.id, reason: 'inactive', daysInactive },
        dedupeKey: `crm.customer.inactive:${c.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return customers.length;
  });
}

async function emitHighValueCrossings(ctx: ServiceContext, threshold: number): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const customers = await tx.customer.findMany({
      where: { deletedAt: null, totalSpent: { gte: threshold } },
      select: { id: true, totalSpent: true },
      take: 5000,
    });
    for (const c of customers) {
      await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.segment.entered',
        payload: { customerId: c.id, reason: 'high_value', totalSpent: Number(c.totalSpent) },
        dedupeKey: `crm.customer.high_value:${c.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return customers.length;
  });
}

async function emitDealsClosingSoon(ctx: ServiceContext, daysAhead: number): Promise<number> {
  const horizon = new Date(Date.now() + daysAhead * 86_400_000);
  return withTenant(ctx, async (tx) => {
    const deals = await tx.deal.findMany({
      where: {
        deletedAt: null,
        closedAt: null,
        expectedCloseDate: { not: null, lte: horizon, gte: new Date() },
      },
      select: { id: true, expectedCloseDate: true, assignedRepId: true },
      take: 5000,
    });
    for (const d of deals) {
      const daysUntil = d.expectedCloseDate
        ? Math.ceil((d.expectedCloseDate.getTime() - Date.now()) / 86_400_000)
        : null;
      await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.deal.updated',
        payload: { dealId: d.id, reason: 'close_date_approaching', daysUntil },
        dedupeKey: `crm.deal.close_date_approaching:${d.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return deals.length;
  });
}

async function emitB2bCreditNearLimit(ctx: ServiceContext, threshold: number): Promise<number> {
  return withTenant(ctx, async (tx) => {
    const accounts = await tx.b2BAccount.findMany({
      where: { deletedAt: null, status: 'active', creditLimit: { gt: 0 } },
      select: { id: true, creditLimit: true, creditUsed: true },
      take: 5000,
    });
    let count = 0;
    for (const a of accounts) {
      const util = Number(a.creditUsed) / Number(a.creditLimit);
      if (util < threshold) continue;
      count += 1;
      await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.b2b_account.updated',
        payload: { b2bAccountId: a.id, reason: 'credit_near_limit', utilization: util },
        dedupeKey: `crm.b2b.credit_near_limit:${a.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return count;
  });
}

async function emitQuotesExpiring(ctx: ServiceContext, daysAhead: number): Promise<number> {
  const horizon = new Date(Date.now() + daysAhead * 86_400_000);
  return withTenant(ctx, async (tx) => {
    const quotes = await tx.quote.findMany({
      where: {
        status: { in: ['submitted', 'accepted'] },
        validUntil: { not: null, lte: horizon, gte: new Date() },
      },
      select: { id: true, validUntil: true, customerId: true },
      take: 5000,
    });
    for (const q of quotes) {
      const daysUntil = q.validUntil
        ? Math.ceil((q.validUntil.getTime() - Date.now()) / 86_400_000)
        : null;
      await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.quote.expired',
        payload: { quoteId: q.id, reason: 'expiring_soon', daysUntil },
        dedupeKey: `crm.quote.expiring:${q.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return quotes.length;
  });
}
