// Faceted filter panel for the PLP. Rendered as a single GET <form> so the
// URL fully captures the filter state — every result page is SSR-cacheable and
// works without client JS. Sort is preserved via a hidden field (the toolbar's
// SortSelect owns changing it).
//
// Vendor/tag facets need an aggregation endpoint to enumerate values; until
// that lands the panel exposes price, availability, and vehicle fitment.

import type { PublicVehicleMake } from '@/lib/commerce';

export interface FacetValues {
  q?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  fitmentMake?: string;
  fitmentYear?: string;
}

export interface FacetPanelProps {
  action: string;
  makes: PublicVehicleMake[];
  values: FacetValues;
}

const YEAR_NOW = 2026;
const YEARS = Array.from({ length: 50 }, (_, i) => YEAR_NOW - i);

export function FacetPanel({ action, makes, values }: FacetPanelProps) {
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

      {makes.length > 0 ? (
        <div className="sf-facet">
          <h4>Fits your vehicle</h4>
          <label style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.4rem' }}>
            <span className="sf-muted" style={{ fontSize: '0.78rem' }}>
              Make
            </span>
            <select
              className="sf-select"
              name="fitmentMake"
              defaultValue={values.fitmentMake ?? ''}
            >
              <option value="">Any make</option>
              {makes.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: '0.4rem',
              marginTop: '0.5rem',
            }}
          >
            <span className="sf-muted" style={{ fontSize: '0.78rem' }}>
              Year
            </span>
            <select
              className="sf-select"
              name="fitmentYear"
              defaultValue={values.fitmentYear ?? ''}
            >
              <option value="">Any year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
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
