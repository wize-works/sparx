'use client';

// Filter row over an entry list. Persists status + free-text search into URL
// search params (debounced) so refreshing the page preserves the editor's
// filter, sharing a link preserves it, and the server-rendered list re-fetches
// with the new params on every change.
//
// Single client island per list page; the server component reads the URL and
// passes the filtered slice in via props.

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
} from '@sparx/ui';
import { Search, X } from 'lucide-react';

export interface EntryListFiltersProps {
  /** Optional list of selectable types. Omit to render a status-only filter. */
  typeChoices?: { key: string; label: string }[];
}

const STATUS_CHOICES = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'archived', label: 'Archived' },
];

export function EntryListFilters({ typeChoices }: EntryListFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [q, setQ] = React.useState(initialQ);
  const status = searchParams.get('status') ?? 'all';
  const type = searchParams.get('type') ?? typeChoices?.[0]?.key ?? '';

  // Push URL search params with the next filter values. We replace (not push)
  // so the browser history doesn't fill with every keystroke.
  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === 'all') next.delete(k);
        else next.set(k, v);
      }
      // Reset cursor whenever filters change — a stale cursor against a new
      // filter would produce an empty page.
      next.delete('cursor');
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams]
  );

  // Debounce search to keep the URL clean and the server-rendered list from
  // re-fetching on every keystroke.
  React.useEffect(() => {
    if (q === initialQ) return;
    const handle = setTimeout(() => {
      update({ q: q.trim() || null });
    }, 350);
    return () => {
      clearTimeout(handle);
    };
  }, [q, initialQ, update]);

  const hasActiveFilter =
    q || status !== 'all' || (type && typeChoices && type !== typeChoices[0]?.key);

  return (
    <Stack direction="row" align="center" gap={3} className="flex-wrap">
      {typeChoices && typeChoices.length > 0 && (
        <Stack gap={1} className="min-w-[12rem]">
          <Select value={type} onValueChange={(v) => update({ type: v })}>
            <SelectTrigger aria-label="Content type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeChoices.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Stack>
      )}
      <Stack gap={1} className="min-w-[10rem]">
        <Select value={status} onValueChange={(v) => update({ status: v })}>
          <SelectTrigger aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_CHOICES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Stack>
      <Stack gap={1} className="min-w-[16rem] flex-1">
        <Stack direction="row" align="center" gap={2}>
          <Search className="h-4 w-4 text-[var(--color-text-tertiary)]" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by title or slug…"
            aria-label="Search entries"
          />
        </Stack>
      </Stack>
      {hasActiveFilter && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<X className="h-3.5 w-3.5" />}
          onClick={() => {
            setQ('');
            update({ q: null, status: null, ...(typeChoices ? {} : { type: null }) });
          }}
        >
          Clear filters
        </Button>
      )}
    </Stack>
  );
}
