// Which delivery options a basket may be offered.
//
// A shipping rate belongs to exactly one (zone, profile) pair — a profile being
// what the console calls a PRODUCT GROUP, and what its own copy promises:
// "Group together products that ship the same way — bulky freight, anything
// needing a signature — so you can price their delivery on its own."
//
// Rating used to ignore the profile entirely: every rate in a matching zone was
// offered to every basket. A shop that priced coats at $25 offered $25 to
// somebody buying a scarf, and would have offered a cheap small-parcel rate on
// an order of coats. That is wrong money in both directions, on a promise the
// screen makes in as many words (issue 427).
//
// ── THE RULE ────────────────────────────────────────────────────────────────
//
// 1. Each item resolves to ONE group: its own, else its product's, else its
//    collection's, else no group at all.
// 2. The shop's OLDEST group is the FALLBACK: it covers everything that is in
//    no group, which is exactly what the shipping list means by "All other
//    products". Every shop is created with one, which is why an ordinary shop
//    never has to think about groups at all.
//
//    It is the OLDEST one and not "the one with no members", which is what this
//    rule said first and which was wrong on the screen within a minute. The
//    moment an owner creates a second group there are two empty ones, and an
//    empty group is the same shape whether it is the shop's default or one she
//    made ten seconds ago and has not filled yet. Reading it that way made a
//    brand-new "Coats" group the fallback for a basket of scarves, and rule 4
//    then priced the scarves as coats. Age is unambiguous, needs no column, and
//    does not change under her.
// 3. An option is offered only if its group is present in the basket.
// 4. If the basket MIXES groups, it is priced by the group that costs the most
//    to send, because one parcel has to satisfy the strictest thing in it. A
//    coat and a scarf in one box is still a coat-sized box.
//
// Rule 4 is deliberately not "add the groups up": a shop that wants two parcels
// priced separately is asking for split fulfilment, which is a different
// feature and not something to infer from a basket.

/** What a shipment's contents are grouped as. */
export interface ProfilePresence {
  /** Groups that at least one item in the shipment explicitly belongs to. */
  explicit: Set<string>;
  /** True when at least one item belongs to no group at all. */
  ungrouped: boolean;
}

/** One item's group links, most specific first. `null` entries are ordinary
 *  "this item has no link at this level". */
export interface ItemProfileLinks {
  variantProfileId?: string | null;
  productProfileId?: string | null;
  collectionProfileIds?: string[];
}

/**
 * The ONE group an item ships under. Most specific link wins: a variant that
 * names its own group beats the product's, which beats any collection's.
 *
 * A collection link is the only one that can be ambiguous — a product can sit
 * in several collections — so the lowest id wins, chosen for stability rather
 * than for meaning. Two collections claiming the same product for different
 * groups is a shop contradicting itself, and picking deterministically at least
 * means it does not change price between two reloads.
 */
export function profileForItem(links: ItemProfileLinks): string | null {
  if (links.variantProfileId) return links.variantProfileId;
  if (links.productProfileId) return links.productProfileId;
  const fromCollections = [...(links.collectionProfileIds ?? [])].filter(Boolean).sort();
  return fromCollections[0] ?? null;
}

/** What a whole basket is grouped as. */
export function profilePresenceFor(items: ItemProfileLinks[]): ProfilePresence {
  const explicit = new Set<string>();
  let ungrouped = false;
  for (const item of items) {
    const id = profileForItem(item);
    if (id) explicit.add(id);
    else ungrouped = true;
  }
  // An EMPTY shipment is not an ungrouped one. Nothing is in it, so nothing
  // claims the fallback — the caller decides what to do with an empty basket,
  // and rating one is not this module's business.
  if (items.length === 0) return { explicit, ungrouped: false };
  return { explicit, ungrouped };
}

/**
 * The groups whose delivery options this shipment may be offered.
 *
 * `presence` absent means the caller could not say what is in the parcel. That
 * resolves to the FALLBACK group only — an unknown parcel is priced as ordinary
 * goods — because the alternative is offering a bulky-freight surcharge, or a
 * small-parcel bargain, to a basket nobody looked at.
 */
export function applicableProfileIds(
  presence: ProfilePresence | undefined,
  fallbackProfileId: string | null
): Set<string> {
  const fallback = new Set(fallbackProfileId ? [fallbackProfileId] : []);
  if (!presence) return fallback;
  const out = new Set(presence.explicit);
  if (presence.ungrouped && fallbackProfileId) out.add(fallbackProfileId);
  return out;
}

/**
 * Rule 4: of the groups actually quoting, the one that costs the most to send.
 *
 * A group's cost is its CHEAPEST option, because that is what the shopper would
 * pay under it. The group whose cheapest option is dearest is the one the
 * parcel really needs; ties break on the id so two reloads agree.
 *
 * Returns null when nothing quoted, which the caller reads as "no manual rate
 * applies here" rather than as an error.
 */
export function dominantProfileId(
  priced: readonly { profileId: string; amountCents: number }[]
): string | null {
  const cheapestByProfile = new Map<string, number>();
  for (const row of priced) {
    const seen = cheapestByProfile.get(row.profileId);
    if (seen === undefined || row.amountCents < seen) {
      cheapestByProfile.set(row.profileId, row.amountCents);
    }
  }
  let winner: string | null = null;
  let best = -1;
  for (const [profileId, amount] of [...cheapestByProfile].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    if (amount > best) {
      best = amount;
      winner = profileId;
    }
  }
  return winner;
}

/**
 * The whole rule, applied to rates that have already been priced.
 *
 * Kept separate from the pricing so the decision is a pure function over data,
 * which is the only way a rule about money gets a test that can go red.
 */
export function offerableRates<T extends { profileId: string; amountCents: number }>(
  priced: readonly T[],
  presence: ProfilePresence | undefined,
  fallbackProfileId: string | null
): T[] {
  const applicable = applicableProfileIds(presence, fallbackProfileId);
  const candidates = priced.filter((row) => applicable.has(row.profileId));
  const dominant = dominantProfileId(candidates);
  if (dominant === null) return [];
  return candidates.filter((row) => row.profileId === dominant);
}
