'use client';

// Which rules the list is showing, and the chips that narrow it.
//
// Split from `redirects-list.tsx` under RULE #0.5. Filtering happens in the
// browser because the whole table arrives in one request — it is a config list,
// not a data set — so this is a pure question over rows already in hand.

import { useMemo } from 'react';
import type { Redirect, RedirectStatusCode } from './redirects-data';

/** "Permanent" folds 301+308, "Temporary" 302+307 — the same distinction the
 *  badge draws, so the filter matches what people see. */
export const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'permanent', label: 'Permanent' },
  { value: 'temporary', label: 'Temporary' },
] as const;

export type TypeFilterValue = (typeof TYPE_FILTERS)[number]['value'];

function isTemporary(code: RedirectStatusCode): boolean {
  return code === 302 || code === 307;
}

/** The rows to draw, and whether anything is being held back — the second half
 *  matters because a short list with no explanation reads as a short list. */
export function useFilteredRedirects(
  rows: readonly Redirect[],
  search: string,
  typeFilter: TypeFilterValue
): { filtered: Redirect[]; narrowed: boolean } {
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter === 'temporary' && !isTemporary(row.status_code)) return false;
      if (typeFilter === 'permanent' && isTemporary(row.status_code)) return false;
      if (needle === '') return true;
      return (
        row.from_path.toLowerCase().includes(needle) || row.to_path.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, typeFilter]);

  return { filtered, narrowed: search.trim() !== '' || typeFilter !== 'all' };
}
