// Vehicle-narrowing filter. Phase 1 surfaces make + year only; chained
// model/engine selects land when the storefront-side lazy reads are
// added.
//
// Rendered as a plain GET <form> so the URL captures the filter and
// the page is fully SSR/cacheable per query — no client JS required.

import type { PublicVehicleMake } from '@/lib/commerce';

export interface FitmentFilterProps {
  makes: PublicVehicleMake[];
  selectedMake?: string;
  selectedYear?: number;
  formAction?: string;
}

const YEAR_NOW = 2026; // bumped manually; storefront avoids Date.now() so SSR cache is deterministic.
const YEARS = Array.from({ length: 50 }, (_, i) => YEAR_NOW - i);

export function FitmentFilter({
  makes,
  selectedMake,
  selectedYear,
  formAction,
}: FitmentFilterProps) {
  if (makes.length === 0) return null;
  return (
    <form
      method="GET"
      action={formAction ?? '/products'}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
        padding: '1rem',
        borderRadius: '10px',
        background: 'var(--color-bg-subtle, #f6f7fa)',
      }}
    >
      <strong style={{ fontSize: '0.85rem', letterSpacing: '0.02em' }}>Fits your vehicle</strong>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span
          style={{
            fontSize: '0.7rem',
            color: 'var(--color-text-muted, #6b7280)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Make
        </span>
        <select name="fitmentMake" defaultValue={selectedMake ?? ''} style={selectStyle()}>
          <option value="">Any</option>
          {makes.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <span
          style={{
            fontSize: '0.7rem',
            color: 'var(--color-text-muted, #6b7280)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Year
        </span>
        <select
          name="fitmentYear"
          defaultValue={selectedYear?.toString() ?? ''}
          style={selectStyle()}
        >
          <option value="">Any</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        style={{
          alignSelf: 'flex-end',
          padding: '0.5rem 1rem',
          background: 'var(--color-action-primary, #6366f1)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        Show fitting
      </button>
    </form>
  );
}

function selectStyle(): React.CSSProperties {
  return {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid var(--color-border-default, #d1d5db)',
    background: 'var(--color-bg-surface, #ffffff)',
    fontSize: '0.9rem',
    minWidth: '8rem',
  };
}
