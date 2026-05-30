// Faceted filter panel for the PLP. Rendered as a single GET <form> so the
// URL fully captures the filter state — every result page is SSR-cacheable and
// works without client JS. Sort is preserved via a hidden field (the toolbar's
// SortSelect owns changing it).
//
// Fitment is domain-aware: the panel adapts its labels + range widget to the
// active fitment domain (Vehicle → "Make"/"Year", Pet → "Species"/"Weight",
// …). With multiple domains a switcher appears; choosing one + Apply reloads
// the form with that domain's categories. Vendor/tag facets need an
// aggregation endpoint to enumerate values and land later.

import type { PublicFitmentCategory, PublicFitmentDomain } from '@/lib/commerce';

export interface FacetValues {
  q?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  fitmentDomain?: string; // domain slug
  fitmentCategory?: string; // category name
  fitmentRangeValue?: string; // year / weight / size value
}

export interface FacetPanelProps {
  action: string;
  domains: PublicFitmentDomain[];
  /** The currently-active domain (chosen via ?fitmentDomain= or the only/first
   *  one) and its categories, pre-loaded by the page. */
  activeDomain: PublicFitmentDomain | null;
  categories: PublicFitmentCategory[];
  values: FacetValues;
}

const YEAR_NOW = 2026;
const YEARS = Array.from({ length: 50 }, (_, i) => YEAR_NOW - i);
const US_SHOES = Array.from({ length: 21 }, (_, i) => (5 + i * 0.5).toString());
const EU_SHOES = Array.from({ length: 16 }, (_, i) => (35 + i).toString());

export function FacetPanel({ action, domains, activeDomain, categories, values }: FacetPanelProps) {
  const categoryLabel = activeDomain?.labels?.l1 ?? 'Category';
  const rangeLabel = activeDomain?.labels?.range ?? 'Range';
  const rangeUnit = activeDomain?.rangeUnit ?? null;

  return (
    <form id="plp-filters" className="sf-facets" method="GET" action={action}>
      {values.q ? <input type="hidden" name="q" value={values.q} /> : null}
      <input type="hidden" name="sort" value={values.sort ?? 'relevance'} />

      <div className="sf-facet">
        <h4>Price</h4>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            className="sf-select"
            type="number"
            name="minPrice"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            defaultValue={values.minPrice ?? ''}
            style={{ width: '100%' }}
            aria-label="Minimum price (dollars)"
          />
          <span className="sf-muted">–</span>
          <input
            className="sf-select"
            type="number"
            name="maxPrice"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            defaultValue={values.maxPrice ?? ''}
            style={{ width: '100%' }}
            aria-label="Maximum price (dollars)"
          />
        </div>
      </div>

      <div className="sf-facet">
        <h4>Availability</h4>
        <label>
          <input type="checkbox" name="inStock" value="true" defaultChecked={values.inStock} />
          In stock only
        </label>
      </div>

      {activeDomain ? (
        <div className="sf-facet">
          <h4>
            {domains.length > 1
              ? 'Fits your'
              : `Fits your ${activeDomain.displayName.toLowerCase()}`}
          </h4>

          {domains.length > 1 ? (
            <label
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '0.4rem',
                marginBottom: '0.5rem',
              }}
            >
              <span className="sf-muted" style={{ fontSize: '0.78rem' }}>
                Type
              </span>
              <select className="sf-select" name="fitmentDomain" defaultValue={activeDomain.slug}>
                {domains.map((d) => (
                  <option key={d.id} value={d.slug}>
                    {d.displayName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
            <span className="sf-muted" style={{ fontSize: '0.78rem' }}>
              {categoryLabel}
            </span>
            <select
              className="sf-select"
              name="fitmentCategory"
              defaultValue={values.fitmentCategory ?? ''}
            >
              <option value="">Any {categoryLabel.toLowerCase()}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {rangeUnit ? (
            <label
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '0.4rem',
                marginTop: '0.5rem',
              }}
            >
              <span className="sf-muted" style={{ fontSize: '0.78rem' }}>
                {rangeLabel}
              </span>
              <RangeWidget unit={rangeUnit} value={values.fitmentRangeValue} label={rangeLabel} />
            </label>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="sf-btn sf-btn--primary" style={{ flex: 1 }}>
          Apply
        </button>
        <a href={action} className="sf-btn sf-btn--ghost" aria-label="Clear filters">
          Clear
        </a>
      </div>
    </form>
  );
}

// Range widget chosen by the domain's unit. Always writes to `fitmentRangeValue`
// so the page reads one param regardless of vertical.
function RangeWidget({ unit, value, label }: { unit: string; value?: string; label: string }) {
  const unitSuffix = (() => {
    switch (unit) {
      case 'lb':
        return 'lb';
      case 'kg':
        return 'kg';
      case 'mm':
        return 'mm';
      case 'in':
        return 'in';
      case 'month':
        return 'months';
      default:
        return '';
    }
  })();

  if (unit === 'year') {
    return (
      <select className="sf-select" name="fitmentRangeValue" defaultValue={value ?? ''}>
        <option value="">Any year</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    );
  }

  if (unit === 'us_shoe' || unit === 'eu_shoe') {
    const sizes = unit === 'us_shoe' ? US_SHOES : EU_SHOES;
    return (
      <select className="sf-select" name="fitmentRangeValue" defaultValue={value ?? ''}>
        <option value="">Any size</option>
        {sizes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    );
  }

  // Numeric units (weight, age, dimension) → number input with a unit suffix.
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <input
        className="sf-select"
        type="number"
        name="fitmentRangeValue"
        inputMode="decimal"
        min={0}
        step="any"
        placeholder={label}
        defaultValue={value ?? ''}
        style={{ width: '100%' }}
        aria-label={`${label}${unitSuffix ? ` (${unitSuffix})` : ''}`}
      />
      {unitSuffix ? <span className="sf-muted">{unitSuffix}</span> : null}
    </span>
  );
}
