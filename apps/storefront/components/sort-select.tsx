'use client';

// Sort control for product listings. Navigates by rewriting the `sort` query
// param while preserving all other params (facets, page reset). Self-contained
// so it composes next to the SSR facet form without sharing state.

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const OPTIONS: { value: string; label: string }[] = [
  { value: 'relevance', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'title-asc', label: 'Name: A–Z' },
  { value: 'title-desc', label: 'Name: Z–A' },
];

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <span className="sf-muted" style={{ fontSize: '0.85rem' }}>
        Sort
      </span>
      <select
        className="sf-select"
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set('sort', e.target.value);
          next.delete('page');
          router.push(`${pathname}?${next.toString()}`);
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
