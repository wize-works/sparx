// Formatting helpers. Money is integer cents everywhere on the wire; format
// only at the render boundary. Currency/locale come from the tenant's
// storefront settings so a EUR/de-DE merchant renders natively.

export function formatMoney(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
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
