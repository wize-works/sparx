// Renders a product's fitment rows, grouped by domain, with column headers
// drawn from each domain's labels (so a vehicle shows "Make / Model / Engine /
// Year" while a pet store shows "Species / Breed / Weight"). Columns with no
// data across a group are hidden.

import { formatFitmentRange } from '@/lib/format';
import type { PublicFitmentDomain, PublicProductFitment } from '@/lib/commerce';

export interface FitmentTableProps {
  fitments: PublicProductFitment[];
  /** Domain metadata keyed by slug, for level labels. */
  domainsBySlug: Record<string, PublicFitmentDomain>;
}

export function FitmentTable({ fitments, domainsBySlug }: FitmentTableProps) {
  // Group rows by domain slug, preserving first-seen order.
  const groups = new Map<string, PublicProductFitment[]>();
  for (const f of fitments) {
    const arr = groups.get(f.domainSlug) ?? [];
    arr.push(f);
    groups.set(f.domainSlug, arr);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {[...groups.entries()].map(([slug, rows]) => {
        const domain = domainsBySlug[slug];
        const labels = domain?.labels;
        const l1 = labels?.l1 ?? 'Category';
        const l2 = labels?.l2 ?? 'Item';
        const l3 = labels?.l3 ?? 'Variant';
        const rangeLabel = labels?.range ?? 'Range';

        const showItem = rows.some((r) => r.item);
        const showVariant = rows.some((r) => r.variant);
        const showRange = rows.some((r) => r.rangeMin != null || r.rangeMax != null);
        const showNotes = rows.some((r) => r.notes);
        const heading = rows[0]?.domainLabel ?? domain?.displayName ?? 'Fitment';

        return (
          <div key={slug}>
            {groups.size > 1 ? (
              <h3 className="sf-h3" style={{ marginBottom: '0.75rem' }}>
                {heading}
              </h3>
            ) : null}
            <div style={{ overflowX: 'auto' }}>
              <table className="sf-fitment-table">
                <thead>
                  <tr>
                    <th>{l1}</th>
                    {showItem ? <th>{l2}</th> : null}
                    {showVariant ? <th>{l3}</th> : null}
                    {showRange ? <th>{rangeLabel}</th> : null}
                    {showNotes ? <th>Notes</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id}>
                      <td>{f.category}</td>
                      {showItem ? <td>{f.item ?? '—'}</td> : null}
                      {showVariant ? <td>{f.variant ?? '—'}</td> : null}
                      {showRange ? (
                        <td>{formatFitmentRange(f.rangeMin, f.rangeMax, f.rangeUnit) ?? '—'}</td>
                      ) : null}
                      {showNotes ? <td>{f.notes ?? '—'}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
