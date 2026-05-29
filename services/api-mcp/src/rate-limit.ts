// Per-tenant rate limits for the MCP transport, per docs/07 §7.
//
//   • Pro:        60 req/min,   5,000 req/day
//   • Enterprise: 300 req/min, 50,000 req/day
//   • Writes:     additional 10 req/min cap on `tools/call` for write tools
//                 (write:crm + write:crm_bulk scopes) — protects against
//                 bulk-action mistakes per docs/07 §7.
//
// Starter is rejected outright — MCP is a Pro/Enterprise feature in docs/07.
//
// Phase 1 implementation uses in-process token buckets. The api-mcp HPA is
// capped at 2 replicas (api-rest already enforces this), so cross-pod drift
// is small and acceptable. Redis-backed counters land when we exceed one
// replica's throughput; the bucket API is shaped so the storage can swap
// without touching the policy.

import { prisma } from '@sparx/db';
import type { McpAuthContext } from './auth.js';

export interface PlanQuota {
  perMinute: number;
  perDay: number;
}

const PLAN_QUOTAS: Record<string, PlanQuota | null> = {
  starter: null, // MCP not available on starter
  pro: { perMinute: 60, perDay: 5_000 },
  enterprise: { perMinute: 300, perDay: 50_000 },
};

const WRITE_PER_MINUTE = 10;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

interface Bucket {
  count: number;
  resetAt: number;
}

interface TenantBuckets {
  minute: Bucket;
  day: Bucket;
  writeMinute: Bucket;
}

const buckets = new Map<string, TenantBuckets>();
const planCache = new Map<string, { plan: string; expiresAt: number }>();
const PLAN_CACHE_TTL_MS = 60_000;

function freshBucket(windowMs: number, now: number): Bucket {
  return { count: 0, resetAt: now + windowMs };
}

function getOrCreate(tenantId: string, now: number): TenantBuckets {
  let b = buckets.get(tenantId);
  if (!b) {
    b = {
      minute: freshBucket(MS_PER_MINUTE, now),
      day: freshBucket(MS_PER_DAY, now),
      writeMinute: freshBucket(MS_PER_MINUTE, now),
    };
    buckets.set(tenantId, b);
    return b;
  }
  if (now >= b.minute.resetAt) b.minute = freshBucket(MS_PER_MINUTE, now);
  if (now >= b.day.resetAt) b.day = freshBucket(MS_PER_DAY, now);
  if (now >= b.writeMinute.resetAt) b.writeMinute = freshBucket(MS_PER_MINUTE, now);
  return b;
}

async function resolvePlan(tenantId: string, now: number): Promise<string> {
  const cached = planCache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.plan;
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  const plan = row?.plan ?? 'starter';
  planCache.set(tenantId, { plan, expiresAt: now + PLAN_CACHE_TTL_MS });
  return plan;
}

export class RateLimitError extends Error {
  readonly code = 'RATE_LIMITED' as const;
  readonly retryAfterSeconds: number;
  readonly limit: number;
  readonly window: 'minute' | 'day';
  readonly scope: 'tenant' | 'tenant_writes' | 'plan_not_eligible';
  constructor(
    message: string,
    opts: {
      retryAfterSeconds: number;
      limit: number;
      window: 'minute' | 'day';
      scope: RateLimitError['scope'];
    }
  ) {
    super(message);
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.limit = opts.limit;
    this.window = opts.window;
    this.scope = opts.scope;
  }
}

interface EnforceArgs {
  auth: McpAuthContext;
  /** True when this HTTP call is a tools/call dispatching a write-scope
   *  tool (write:crm or write:crm_bulk). Determined by the route handler
   *  using the request body + the tool registry. */
  isWriteCall: boolean;
}

/** Consume one slot for the tenant — and additionally one write slot when
 *  the dispatched tool is a write — or throw RateLimitError. */
export async function enforceRateLimit(args: EnforceArgs): Promise<void> {
  const now = Date.now();
  const plan = await resolvePlan(args.auth.tenantId, now);
  const quota = PLAN_QUOTAS[plan];
  if (!quota) {
    throw new RateLimitError(`MCP is not available on the "${plan}" plan.`, {
      retryAfterSeconds: 0,
      limit: 0,
      window: 'day',
      scope: 'plan_not_eligible',
    });
  }
  const t = getOrCreate(args.auth.tenantId, now);

  if (t.minute.count >= quota.perMinute) {
    throw new RateLimitError(
      `Rate limit exceeded: ${quota.perMinute} requests/minute on plan "${plan}".`,
      {
        retryAfterSeconds: Math.max(1, Math.ceil((t.minute.resetAt - now) / 1000)),
        limit: quota.perMinute,
        window: 'minute',
        scope: 'tenant',
      }
    );
  }
  if (t.day.count >= quota.perDay) {
    throw new RateLimitError(
      `Daily quota exceeded: ${quota.perDay} requests/day on plan "${plan}".`,
      {
        retryAfterSeconds: Math.max(1, Math.ceil((t.day.resetAt - now) / 1000)),
        limit: quota.perDay,
        window: 'day',
        scope: 'tenant',
      }
    );
  }
  if (args.isWriteCall && t.writeMinute.count >= WRITE_PER_MINUTE) {
    throw new RateLimitError(`Write rate limit exceeded: ${WRITE_PER_MINUTE} write calls/minute.`, {
      retryAfterSeconds: Math.max(1, Math.ceil((t.writeMinute.resetAt - now) / 1000)),
      limit: WRITE_PER_MINUTE,
      window: 'minute',
      scope: 'tenant_writes',
    });
  }

  t.minute.count += 1;
  t.day.count += 1;
  if (args.isWriteCall) t.writeMinute.count += 1;
}

/** Test-only — clears in-memory buckets + plan cache between cases. */
export function __resetRateLimitState(): void {
  buckets.clear();
  planCache.clear();
}
