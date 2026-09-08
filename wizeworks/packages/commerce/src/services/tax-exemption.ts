// Whether a customer's exemption certificate covers the place being taxed.
//
// The schema has said for a long time that this is "enforced at checkout
// (taxService.calculate skips lines on a matching exemption)". It was not:
// `calculate` parsed `customerExemptionIds` and never read them. Nothing else
// did either, so a reseller with a certificate on file was in exactly the same
// position as a walk-in shopper — which only became visible once tax started
// being charged at all.

/** The stored certificate, reduced to what deciding needs. */
export interface ExemptionLike {
  /** "US" or "US-CA" — a country, or one region inside it. */
  jurisdiction: string;
  validFrom: Date;
  validTo: Date | null;
}

/** The place a tax zone covers. */
export interface ZoneLike {
  country: string;
  /** ISO 3166-2 ("US-CA"), or null for the whole country. */
  region: string | null;
}

/**
 * Does this certificate cover this zone, on this day?
 *
 * A country-wide certificate ("US") covers every zone in that country,
 * including a state one. A state certificate ("US-CA") covers only that state —
 * never the country-level zone, because a California resale certificate says
 * nothing about Texas.
 *
 * An open-ended certificate (`validTo: null`) never expires, which is the usual
 * shape; a dated one stops covering the day after it ends.
 */
export function exemptionCovers(zone: ZoneLike, exemption: ExemptionLike, at: Date): boolean {
  if (at < exemption.validFrom) return false;
  if (exemption.validTo && at > exemption.validTo) return false;

  const jurisdiction = exemption.jurisdiction.trim().toUpperCase();
  const country = zone.country.trim().toUpperCase();
  if (jurisdiction === country) return true;
  return jurisdiction === zone.region?.trim().toUpperCase();
}

/** The first certificate that covers this zone today, or null. Returning the
 *  certificate rather than a boolean is deliberate: the order needs to record
 *  WHICH one exempted it, or the shop cannot answer an auditor. */
export function coveringExemption<T extends ExemptionLike>(
  zone: ZoneLike,
  exemptions: readonly T[],
  at: Date
): T | null {
  return exemptions.find((exemption) => exemptionCovers(zone, exemption, at)) ?? null;
}
