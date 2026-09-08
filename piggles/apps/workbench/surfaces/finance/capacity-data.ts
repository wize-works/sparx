'use client';

// What this business is using, against what its plan includes.
//
// GET /v1/usage/capacity carries no money — a meter's state is a fact about the
// business, and what expanding it costs is the account app's answer. That is what
// makes this readable from the console at all (piggles/CLAUDE.md RULE #2).

import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';

export type Meter =
  'seats' | 'sites' | 'locations' | 'contacts' | 'storageBytes' | 'emailSendsPerMonth';

/** `unmetered` — no ceiling is set. `unknown` — nobody has counted it. Neither is
 *  `ok`, which is a claim, and a surface must render all three differently. */
export type MeterState = 'unmetered' | 'unknown' | 'ok' | 'approaching' | 'over';

export interface MeterReading {
  meter: Meter;
  /** Decimal STRING — byte counts exceed a JSON number. Null = not measured. */
  used: string | null;
  limit: string | null;
  /** Not clamped: 1.2 means 120%, because rounding it to "full" hides how far
   *  over they are. */
  fraction: number | null;
  state: MeterState;
}

export interface Capacity {
  meters: MeterReading[];
  /** ISO, or null when this business has never been snapshotted. */
  measuredAt: string | null;
  allowanceSource: 'configured' | 'none';
}

export function useCapacity() {
  return useQuery({
    queryKey: ['finance', 'capacity'],
    queryFn: () => api.get<Capacity>('/v1/usage/capacity'),
    // The stocks come from a nightly snapshot, so refetching on every focus buys
    // nothing and costs a request per tab switch.
    staleTime: 5 * 60 * 1000,
  });
}

/** What Piggles calls each meter. Nobody has "seats" or "contacts". */
export const METER_LABEL: Record<Meter, string> = {
  seats: 'people on your team',
  sites: 'websites',
  locations: 'locations',
  contacts: 'customers',
  storageBytes: 'storage',
  emailSendsPerMonth: 'messages this month',
};

/**
 * The one meter worth interrupting somebody about, or null.
 *
 * Over before approaching, then fullest first — a single notice should carry the
 * thing actually about to cost them something. Null is the common answer, and it
 * means the card renders nothing at all.
 */
export function worstMeter(capacity: Capacity | undefined): MeterReading | null {
  if (!capacity) return null;
  const notable = capacity.meters.filter((m) => m.state === 'over' || m.state === 'approaching');
  // `?? null` rather than a non-null assertion: the length check above proves
  // there is an element, but `noUncheckedIndexedAccess` is right not to take my
  // word for it, and one honest coalesce is cheaper than teaching it to.
  return (
    notable.sort(
      (a, b) =>
        (a.state === 'over' ? 0 : 1) - (b.state === 'over' ? 0 : 1) ||
        (b.fraction ?? 0) - (a.fraction ?? 0)
    )[0] ?? null
  );
}
