'use client';

// Header search with typeahead. Debounced queries hit the public products
// endpoint (via the /api/sparx proxy); results drop down with keyboard support.
// Submitting (Enter / search icon) goes to the full /search results page.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const API_BASE = '/api/sparx';

interface Suggestion {
  id: string;
  handle: string;
  title: string;
}

export function SearchBox({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced fetch.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void fetch(
        `${API_BASE}/v1/public/commerce/products?tenant=${encodeURIComponent(tenantSlug)}&q=${encodeURIComponent(term)}&pageSize=6`,
        { signal: ctrl.signal, cache: 'no-store' }
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((json: { data?: Suggestion[] } | null) => {
          setResults(json?.data ?? []);
          setActive(-1);
        })
        .catch(() => {
          /* aborted / network */
        });
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, tenantSlug]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function go(handle?: string) {
    setOpen(false);
    if (handle) router.push(`/products/${handle}`);
    else if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) {
      if (e.key === 'Enter') go();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(active >= 0 ? results[active]?.handle : undefined);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showMenu = open && q.trim().length >= 2 && results.length > 0;

  return (
    <div className="sf-search sf-search--desktop" ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="sf-search__submit"
        aria-label="Search"
        onClick={() => go()}
        style={{ display: 'contents' }}
      >
        <SearchIcon />
      </button>
      <input
        type="search"
        name="q"
        placeholder="Search products…"
        aria-label="Search products"
        autoComplete="off"
        role="combobox"
        aria-expanded={showMenu}
        aria-controls="sf-search-menu"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showMenu ? (
        <ul className="sf-search__menu" id="sf-search-menu" role="listbox">
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <Link
                href={`/products/${r.handle}`}
                className={['sf-search__result', i === active && 'is-active']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setOpen(false)}
              >
                {r.title}
              </Link>
            </li>
          ))}
          <li role="option" aria-selected={false}>
            <button type="button" className="sf-search__result sf-search__all" onClick={() => go()}>
              See all results for “{q.trim()}”
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="sf-search__icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
