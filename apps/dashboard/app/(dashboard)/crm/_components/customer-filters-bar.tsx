'use client';

// Client filter bar — drives the customer list via URL query params so
// shareable links work and saved-view objects (Phase 2 SavedView table) can
// serialize straight off `window.location.search`.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { Badge, Button, Input, Stack } from '@sparx/ui';

interface Props {
  currentType?: string;
  currentTag?: string;
  currentQuery?: string;
  currentSort: 'updatedAt' | 'createdAt' | 'totalSpent' | 'lastOrderAt';
}

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'prospect', label: 'Prospects' },
  { value: 'retail', label: 'Customers' },
  { value: 'b2b', label: 'B2B' },
];

const SORT_OPTIONS: { value: Props['currentSort']; label: string }[] = [
  { value: 'updatedAt', label: 'Recently updated' },
  { value: 'createdAt', label: 'Recently created' },
  { value: 'lastOrderAt', label: 'Last order' },
  { value: 'totalSpent', label: 'Lifetime value' },
];

export function CustomerFiltersBar({ currentType, currentTag, currentQuery, currentSort }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value == null || value === '') next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <Stack gap={3}>
      <Stack direction="row" align="center" gap={3} wrap>
        {TYPE_FILTERS.map((opt) => {
          const active = (opt.value || undefined) === currentType || (!opt.value && !currentType);
          return (
            <Button
              key={opt.value || 'all'}
              type="button"
              size="sm"
              color={active ? 'module' : 'neutral'}
              variant={active ? 'solid' : 'outline'}
              onClick={() => setParam('type', opt.value || null)}
              disabled={pending}
            >
              {opt.label}
            </Button>
          );
        })}

        <span className="mx-2 h-5 w-px bg-[var(--color-border-default)]" aria-hidden />

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setParam('q', (data.get('q') as string) || null);
          }}
        >
          <Input
            type="search"
            name="q"
            placeholder="Search name, email, company…"
            defaultValue={currentQuery ?? ''}
            className="w-72"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Search
          </Button>
        </form>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            setParam('tag', ((data.get('tag') as string) || '').trim() || null);
          }}
        >
          <Input
            type="text"
            name="tag"
            placeholder="Tag…"
            defaultValue={currentTag ?? ''}
            className="w-32"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Filter
          </Button>
        </form>

        <span className="mx-2 h-5 w-px bg-[var(--color-border-default)]" aria-hidden />

        <select
          value={currentSort}
          onChange={(e) => setParam('sort', e.target.value)}
          disabled={pending}
          className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-default)] px-2 py-1 text-sm text-[var(--color-text-primary)]"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </Stack>

      {(currentTag ?? currentType ?? currentQuery) && (
        <Stack direction="row" gap={2} wrap>
          {currentType && (
            <Badge variant="outline">
              type: {currentType}
              <button
                onClick={() => setParam('type', null)}
                className="ml-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label="Clear type filter"
              >
                ×
              </button>
            </Badge>
          )}
          {currentTag && (
            <Badge variant="outline">
              tag: {currentTag}
              <button
                onClick={() => setParam('tag', null)}
                className="ml-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label="Clear tag filter"
              >
                ×
              </button>
            </Badge>
          )}
          {currentQuery && (
            <Badge variant="outline">
              search: {currentQuery}
              <button
                onClick={() => setParam('q', null)}
                className="ml-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                aria-label="Clear search"
              >
                ×
              </button>
            </Badge>
          )}
        </Stack>
      )}
    </Stack>
  );
}
