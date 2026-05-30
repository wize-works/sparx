// SSR pagination — renders prev/next + a windowed set of page links, each
// preserving the current query params. Link-based so it works without JS and
// every page is independently cacheable.

import Link from 'next/link';

export interface PaginationProps {
  basePath: string;
  currentParams: Record<string, string | string[] | undefined>;
  page: number;
  totalPages: number;
}

function hrefFor(
  basePath: string,
  params: Record<string, string | string[] | undefined>,
  page: number
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === 'page' || v === undefined) continue;
    sp.set(k, Array.isArray(v) ? (v[0] ?? '') : v);
  }
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Compact window around the current page: 1 … (p-1) p (p+1) … last
function pageWindow(page: number, total: number): number[] {
  const pages = new Set<number>([1, total, page, page - 1, page + 1]);
  return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
}

export function Pagination({ basePath, currentParams, page, totalPages }: PaginationProps) {
  const window = pageWindow(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: 'flex',
        gap: '0.4rem',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: '3rem',
        flexWrap: 'wrap',
      }}
    >
      {page > 1 ? (
        <Link href={hrefFor(basePath, currentParams, page - 1)} className="sf-btn sf-btn--ghost">
          ← Prev
        </Link>
      ) : null}

      {window.map((p, i) => {
        const gap = i > 0 && p - window[i - 1]! > 1;
        return (
          <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            {gap ? <span className="sf-muted">…</span> : null}
            {p === page ? (
              <span className="sf-btn sf-btn--primary" aria-current="page">
                {p}
              </span>
            ) : (
              <Link href={hrefFor(basePath, currentParams, p)} className="sf-btn sf-btn--ghost">
                {p}
              </Link>
            )}
          </span>
        );
      })}

      {page < totalPages ? (
        <Link href={hrefFor(basePath, currentParams, page + 1)} className="sf-btn sf-btn--ghost">
          Next →
        </Link>
      ) : null}
    </nav>
  );
}
