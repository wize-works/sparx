'use client';

import * as React from 'react';
import { LayoutGrid, Rows3, Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Input } from '../form/input';
import { NativeSelect } from '../form/native-select';

// ListToolbar — the standard toolbar above every Collection/List (docs/34 §7.1).
// One row: a leading search box that grows, inline quick-filter selects, and a
// right cluster (sort + Table/Cards view toggle). Active filters render as
// removable chips below the bar.
//
// Presentational + controlled only: every control reports changes through a
// callback and this component holds no URL/router knowledge — so `@sparx/ui`
// stays framework-agnostic. The dashboard's URL-sync wrapper turns these
// callbacks into debounced `searchParams` updates; the server page reads the
// params and refetches. Filtering is live — there is no "Apply" button.

export interface ListToolbarOption {
  value: string;
  label: string;
}

export interface ListToolbarFilter {
  /** The query-string key this filter writes (e.g. `status`). */
  key: string;
  /** Human label — used for the "All {label}" default option and the chip. */
  label: string;
  options: ListToolbarOption[];
  /** Current value; `''` means no filter applied. */
  value: string;
}

export interface ListToolbarSort {
  options: ListToolbarOption[];
  value: string;
}

export type ListToolbarView = 'table' | 'card';

export interface ListToolbarProps {
  /** Current search text. */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  /** Quick-filter selects, rendered inline after the search box. */
  filters?: ListToolbarFilter[];
  onFilterChange?: (key: string, value: string) => void;

  /** Sort control, pinned right. */
  sort?: ListToolbarSort;
  onSortChange?: (value: string) => void;

  /** Table/Cards toggle, far right. Omit to hide it (single-rendering lists). */
  view?: ListToolbarView;
  onViewChange?: (view: ListToolbarView) => void;

  className?: string;
}

function labelForValue(filter: ListToolbarFilter): string {
  return filter.options.find((o) => o.value === filter.value)?.label ?? filter.value;
}

export function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  onFilterChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  className,
}: ListToolbarProps) {
  const activeChips = filters.filter((f) => f.value !== '');

  return (
    <div className={cn('mb-4 flex flex-col gap-2', className)}>
      <div role="search" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[var(--color-text-tertiary)]"
          />
          <Input
            type="search"
            className="pl-8"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search"
          />
        </div>

        {filters.map((f) => (
          <NativeSelect
            key={f.key}
            className="w-auto"
            aria-label={f.label}
            value={f.value}
            onChange={(e) => onFilterChange?.(f.key, e.target.value)}
          >
            <option value="">All {f.label.toLowerCase()}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        ))}

        {(Boolean(sort) || Boolean(view)) && (
          <div className="ml-auto flex items-center gap-2">
            {sort && (
              <NativeSelect
                className="w-auto"
                aria-label="Sort by"
                value={sort.value}
                onChange={(e) => onSortChange?.(e.target.value)}
              >
                {sort.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            )}

            {view && (
              <div
                role="group"
                aria-label="List view"
                className="inline-flex shrink-0 rounded-md border border-[var(--color-border-default)] p-0.5"
              >
                <ViewButton
                  active={view === 'table'}
                  label="Table view"
                  onClick={() => onViewChange?.('table')}
                >
                  <Rows3 className="h-4 w-4" />
                </ViewButton>
                <ViewButton
                  active={view === 'card'}
                  label="Card view"
                  onClick={() => onViewChange?.('card')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </ViewButton>
              </div>
            )}
          </div>
        )}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange?.(f.key, '')}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] py-1 pr-1.5 pl-2.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              <span className="text-[var(--color-text-tertiary)]">{f.label}:</span>
              <span className="font-medium">{labelForValue(f)}</span>
              <X aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only">Remove {f.label} filter</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ViewButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ViewButton({ active, label, onClick, children }: ViewButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        active
          ? 'bg-[var(--module-active-tint)] text-[var(--module-active)]'
          : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
      )}
    >
      {children}
    </button>
  );
}
