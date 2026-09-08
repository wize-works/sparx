// The guarded send — every text the platform sends goes through here
// (docs/151 §8, docs/152 D1).
//
// ── WHY THIS IS A SEPARATE SUBPATH ───────────────────────────────────────────
//
// `@wizeworks/sms`'s main entry is the provider abstraction and has no database
// dependency, which is what lets anything import it. This file needs `@wizeworks/db`
// to read consent, suppressions, settings and the ledger, so it lives on
// `@wizeworks/sms/delivery` — the same split `@wizeworks/funnels` uses for `./announce`.
//
// ── WHAT IT REFUSES, AND WHY EACH REFUSAL IS ITS OWN STATUS ──────────────────
//
// There are five ways not to send and they are deliberately not collapsed into
// "not sent", because each has a different fix and an owner hunting for the
// wrong one is a support ticket:
//
//   disabled   — nobody turned SMS on for this tenant.
//   suppressed — this number said STOP. Never again, without a new opt-in.
//   held       — quiet hours where the RECIPIENT is. Later today.
//   capped     — the tenant is at their ceiling for the day.
//   failed     — the provider tried and could not.
//
// Every one of them WRITES A LEDGER ROW. "We did not text them, and here is
// why" is an answer; silence is not, and silence is what makes a business owner
// think the feature is broken when it is protecting them.
//
// ── THE CEILING TRIPS BEFORE THE PROVIDER CALL ───────────────────────────────
//
// Counted from the ledger and checked before we hand anything to a vendor, so a
// runaway automation costs nothing rather than costing whatever it managed to
// send before somebody read the invoice. That ordering is the requirement, not
// an implementation detail.

import { withTenant } from '@wizeworks/db';
import { resolveSmsProvider, type SmsEnv } from './registry';
import {
  estimateSegments,
  isQuietHour,
  localHourIn,
  nextSendableAt,
  normalizePhone,
  type QuietHours,
} from './policy';

export type SmsScope = 'marketing' | 'transactional';

export type SmsOutcome =
  'sent' | 'failed' | 'suppressed' | 'held' | 'capped' | 'disabled' | 'no_consent' | 'invalid';

export interface SendTenantSmsInput {
  to: string;
  body: string;
  /** Marketing needs consent and respects quiet hours; transactional does not
   *  wait, because somebody asked for it. Both obey an `all` suppression. */
  scope: SmsScope;
  /** The person, when we know them — used for consent and for the ledger. */
  customerId?: string | null;
  /** Their timezone, when we know it. Quiet hours are theirs, not ours. */
  timezone?: string | null;
}

export interface SendTenantSmsResult {
  outcome: SmsOutcome;
  /** The ledger row, so a caller can point at what happened. */
  messageId: string | null;
  /** Said in words, for a screen. Never a code. */
  reason: string | null;
  /** For `held`: when it becomes sendable. */
  retryAt?: Date;
  segments: number;
}

interface Ctx {
  tenantId: string;
  tx?: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Defaults for a tenant with no settings row yet. Matches the column defaults
 *  so "never configured" and "configured to the defaults" behave identically. */
const DEFAULTS = {
  enabled: false,
  dailyCap: 200,
  quietStartHour: 21,
  quietEndHour: 9,
  fallbackTimezone: 'UTC',
};

/** Does this person's stored consent cover texting? Read from the same
 *  `gdprConsent.scope` array that carries email `marketing`, with `sms` as its
 *  OWN entry — the two are separate permissions and one has never implied the
 *  other. */
function hasSmsConsent(gdprConsent: unknown): boolean {
  if (!gdprConsent || typeof gdprConsent !== 'object') return false;
  const scope = (gdprConsent as { scope?: unknown }).scope;
  return Array.isArray(scope) && scope.includes('sms');
}

/**
 * Send one text, or record precisely why not.
 *
 * Never throws for a refusal or a provider failure — the caller gets an outcome
 * and a ledger row. A marketing automation must not die because one recipient
 * opted out.
 */
export async function sendTenantSms(
  ctx: Ctx,
  input: SendTenantSmsInput,
  env: SmsEnv,
  now: Date = new Date()
): Promise<SendTenantSmsResult> {
  const svcCtx = ctx as { tenantId: string };
  const phone = normalizePhone(input.to);
  const segments = estimateSegments(input.body);

  const record = async (
    outcome: SmsOutcome,
    reason: string | null,
    extra: Record<string, unknown> = {}
  ): Promise<string | null> => {
    try {
      const row = await withTenant(svcCtx, (tx) =>
        tx.smsMessage.create({
          data: {
            tenantId: svcCtx.tenantId,
            customerId: input.customerId ?? null,
            toPhone: phone,
            body: input.body,
            status: outcome,
            reason: reason?.slice(0, 120) ?? null,
            scope: input.scope,
            segments,
            ...extra,
          },
          select: { id: true },
        })
      );
      return row.id;
    } catch {
      // The ledger failing must not also lose the message. The caller still
      // learns the outcome; only the audit row is missing.
      return null;
    }
  };

  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    return {
      outcome: 'invalid',
      messageId: await record('failed', 'That is not a phone number we can text.'),
      reason: 'That is not a phone number we can text.',
      segments,
    };
  }

  const settings = await withTenant(svcCtx, (tx) =>
    tx.smsSettings.findUnique({ where: { tenantId: svcCtx.tenantId } })
  );
  const policy = settings ?? DEFAULTS;

  // ── Shipped dark. Nothing below this line can spend. ──────────────────────
  if (!policy.enabled) {
    const reason = 'Text messaging is not switched on for this business yet.';
    return { outcome: 'disabled', messageId: await record('disabled', reason), reason, segments };
  }

  // ── A STOP outranks everything, including a transactional send. ───────────
  const suppression = await withTenant(svcCtx, (tx) =>
    tx.smsSuppression.findFirst({
      where: {
        tenantId: svcCtx.tenantId,
        phone,
        // `all` binds both scopes; `marketing` binds only marketing. A booking
        // confirmation somebody asked for still reaches a number that merely
        // unticked a marketing box.
        scope: input.scope === 'marketing' ? { in: ['all', 'marketing'] } : 'all',
      },
      select: { reason: true },
    })
  );
  if (suppression) {
    const reason =
      suppression.reason === 'stop'
        ? 'This number replied STOP, so we will not text it again.'
        : 'This number is on the do-not-text list.';
    return {
      outcome: 'suppressed',
      messageId: await record('suppressed', reason),
      reason,
      segments,
    };
  }

  // ── Marketing needs a yes. Transactional does not — they asked for it. ────
  const customerId = input.customerId ?? null;
  if (input.scope === 'marketing' && customerId) {
    const customer = await withTenant(svcCtx, (tx) =>
      tx.customer.findUnique({
        where: { id: customerId },
        select: { gdprConsent: true, doNotContact: true },
      })
    );
    if (customer?.doNotContact) {
      const reason = 'This contact is marked do-not-contact.';
      return {
        outcome: 'suppressed',
        messageId: await record('suppressed', reason),
        reason,
        segments,
      };
    }
    if (!hasSmsConsent(customer?.gdprConsent)) {
      const reason = 'This person has not agreed to be texted.';
      return {
        outcome: 'no_consent',
        messageId: await record('suppressed', reason),
        reason,
        segments,
      };
    }
  }

  // ── Quiet hours, on the RECIPIENT's clock. Marketing only. ────────────────
  if (input.scope === 'marketing') {
    const quiet: QuietHours = {
      startHour: policy.quietStartHour,
      endHour: policy.quietEndHour,
    };
    const zone = input.timezone ?? policy.fallbackTimezone;
    const hour = localHourIn(zone, now);
    if (hour !== null && isQuietHour(hour, quiet)) {
      const retryAt = nextSendableAt(zone, quiet, now);
      const reason = `It is ${String(hour)}:00 where they are, so this is waiting until quiet hours end.`;
      return {
        outcome: 'held',
        messageId: await record('held', reason),
        reason,
        retryAt,
        segments,
      };
    }
  }

  // ── The ceiling, counted from the ledger, BEFORE the vendor call. ─────────
  const sentToday = await withTenant(svcCtx, (tx) =>
    tx.smsMessage.count({
      where: {
        tenantId: svcCtx.tenantId,
        // Only what was actually sent counts against the cap — a refusal cost
        // nothing, and counting refusals would let a misconfigured automation
        // lock a tenant out of texting without ever sending one.
        status: 'sent',
        createdAt: { gte: new Date(now.getTime() - DAY_MS) },
      },
    })
  );
  if (sentToday >= policy.dailyCap) {
    const reason = `This business has reached its limit of ${String(policy.dailyCap)} texts a day.`;
    return { outcome: 'capped', messageId: await record('capped', reason), reason, segments };
  }

  // ── Everything agreed. Send it. ───────────────────────────────────────────
  const provider = resolveSmsProvider(env);
  const result = await provider.send({ to: phone, body: input.body, tenantId: svcCtx.tenantId });

  if (!result.success) {
    const reason = result.errorMessage ?? 'The message could not be delivered.';
    return {
      outcome: 'failed',
      messageId: await record('failed', reason, { providerName: provider.id }),
      reason,
      segments,
    };
  }

  return {
    outcome: 'sent',
    messageId: await record('sent', null, {
      providerName: provider.id,
      providerId: result.messageId ?? null,
      sentAt: now,
    }),
    reason: null,
    segments,
  };
}

/**
 * Record a STOP.
 *
 * Idempotent, and scoped `all` rather than `marketing`: the person told the
 * CARRIER to stop, not our marketing department, and a transactional carve-out
 * they never agreed to is exactly the reading that gets a sender blocked.
 */
export async function suppressNumber(
  ctx: Ctx,
  input: { phone: string; reason: string; source?: string; note?: string }
): Promise<void> {
  const svcCtx = ctx as { tenantId: string };
  const phone = normalizePhone(input.phone);
  await withTenant(svcCtx, (tx) =>
    tx.smsSuppression.upsert({
      where: {
        tenantId_phone_scope: { tenantId: svcCtx.tenantId, phone, scope: 'all' },
      },
      create: {
        tenantId: svcCtx.tenantId,
        phone,
        scope: 'all',
        reason: input.reason.slice(0, 20),
        source: input.source ?? null,
        note: input.note ?? null,
      },
      // A second STOP is not new information; keep the first one's timestamp.
      update: {},
    })
  );
}

/** Undo a suppression — somebody texting START, or staff correcting a mistake. */
export async function unsuppressNumber(ctx: Ctx, phone: string): Promise<void> {
  const svcCtx = ctx as { tenantId: string };
  await withTenant(svcCtx, (tx) =>
    tx.smsSuppression.deleteMany({
      where: { tenantId: svcCtx.tenantId, phone: normalizePhone(phone) },
    })
  );
}
