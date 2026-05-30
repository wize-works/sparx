// Formatting helpers. Money is integer cents everywhere on the wire; format
// only at the render boundary. Currency/locale come from the tenant's
// storefront settings so a EUR/de-DE merchant renders natively.

export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

// Unit suffixes for fitment ranges. Years and shoe sizes read bare; weights /
// dimensions / ages carry a suffix.
const RANGE_SUFFIX: Record<string, string> = {
  lb: ' lb',
  kg: ' kg',
  mm: ' mm',
  in: ' in',
  month: ' mo',
};

/** Format a fitment range value/span by unit: "2011–2016", "40–80 lb", "9.5". */
export function formatFitmentRange(
  min: number | null,
  max: number | null,
  unit: string | null
): string | null {
  if (min == null && max == null) return null;
  const suffix = unit ? (RANGE_SUFFIX[unit] ?? '') : '';
  // Years are whole numbers; everything else may carry decimals.
  const fmt = (n: number) => (unit === 'year' ? String(Math.round(n)) : String(n));
  if (min != null && max != null && min !== max) return `${fmt(min)}–${fmt(max)}${suffix}`;
  const single = min ?? max!;
  return `${fmt(single)}${suffix}`;
}

/** Render a min–max range, collapsing to a single value when equal/absent. */
export function formatPriceRange(
  minCents: number | null,
  maxCents: number | null,
  currency = 'USD',
  locale = 'en-US'
): string | null {
  if (minCents === null) return null;
  if (maxCents === null || maxCents === minCents) {
    return formatMoney(minCents, currency, locale);
  }
  return `${formatMoney(minCents, currency, locale)} – ${formatMoney(maxCents, currency, locale)}`;
}
