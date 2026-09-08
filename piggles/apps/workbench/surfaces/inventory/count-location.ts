// WHERE A COUNT FORM SHOULD OPEN.
//
// A count is (version × place × number), and the place is the one part the
// software can usually work out. It was not working it out: the form opened on
// whichever location sorted first by name, so a business that keeps everything
// in one building was offered a different one every time and had to correct it
// on every version it counted. One slip puts stock in a building nobody uses,
// and stock in the wrong building is invisible to the shop that needs it.
//
// ── Why not the site's "default location" setting ────────────────────────
//
// There is a `defaultWarehouseId` on commerce site settings and it looks like
// the answer. It is not: nothing in the console edits it, and `bootstrapDefaults`
// writes it once by picking the OLDEST warehouse. On 2026-09-08 all 35 rows on
// the platform carried a value and 34 had never been updated. Treating a
// machine-written guess as somebody's answer is how the wrong building gets
// authority — so this reads EVIDENCE instead, and evidence beats settings here
// because a count is a statement about a real shelf.
//
// ── The ladder, most specific first ──────────────────────────────────────
//
// 1. Where this exact version is already counted. Unarguable.
// 2. Where this person last recorded a count. They are still standing there,
//    and a place they chose ON PURPOSE must not be overruled next time.
// 3. Where the rest of this product is counted. Adding a color to a shirt makes
//    new versions of a thing already sitting somewhere, and that is the case
//    this whole file exists for.
// 4. Whatever the list offers first — today's behavior, now the last resort.
//
// 2 sits above 3 deliberately. If somebody counts one Moss shirt at the
// Fulfillment Center, the next Moss shirt is at the Fulfillment Center too,
// even though its fifteen siblings are all in the Main Warehouse.

const KEY = 'piggles-console-last-count-location';

/**
 * The last place a count was recorded, or null.
 *
 * Per-person and deliberately LOCAL: it describes where somebody is working
 * this afternoon, not anything about the business. It is never trusted on its
 * own — `pickCountLocation` only uses it when the id is still one of the places
 * on offer, which is also what makes a leftover id from another business or a
 * closed location harmless rather than wrong.
 */
export function readLastCountLocation(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeLastCountLocation(warehouseId: string): void {
  if (typeof localStorage === 'undefined' || warehouseId === '') return;
  try {
    localStorage.setItem(KEY, warehouseId);
  } catch {
    // Storage full or blocked. The next form opens on the ladder's other rungs,
    // which is a worse guess and not a broken one.
  }
}

export interface CountLocationEvidence {
  /** Places this exact version already has a count at. */
  here: string[];
  /** Places the REST of this product is counted at, one entry per count. */
  nearby: string[];
  /** The last place this person recorded a count, if any. */
  remembered: string | null;
  /** Every place they may pick, in the order the list shows them. */
  offered: string[];
}

/** The place that appears most often, or null. Ties go to the first seen. */
function commonest(places: string[]): string | null {
  const tally = new Map<string, number>();
  for (const place of places) tally.set(place, (tally.get(place) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [place, count] of tally) {
    if (count > bestCount) {
      best = place;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Which location a count form should open on.
 *
 * Returns `''` only when there is nowhere to count, which the form treats as
 * "not ready to save" rather than as a location.
 */
export function pickCountLocation(evidence: CountLocationEvidence): string {
  const offered = new Set(evidence.offered);
  const usable = (place: string | null): place is string => place !== null && offered.has(place);

  const here = evidence.here.find((place) => offered.has(place)) ?? null;
  if (usable(here)) return here;

  if (usable(evidence.remembered)) return evidence.remembered;

  const nearby = commonest(evidence.nearby.filter((place) => offered.has(place)));
  if (usable(nearby)) return nearby;

  return evidence.offered[0] ?? '';
}
