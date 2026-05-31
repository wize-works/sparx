'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../primitives/button';

// Controlled pagination — owners drive page state. Renders a compact list
// of page buttons with smart "…" elision when total > 7.

export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onChange'> {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Number of sibling pages to show on each side of the current page. Default 1. */
  siblings?: number;
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function buildPages(page: number, pageCount: number, siblings: number): (number | 'ellipsis')[] {
  const total = siblings * 2 + 5; // first, last, current, 2× siblings, 2× ellipsis slots
  if (pageCount <= total) return range(1, pageCount);

  const left = Math.max(page - siblings, 2);
  const right = Math.min(page + siblings, pageCount - 1);
  const showLeftEllipsis = left > 2;
  const showRightEllipsis = right < pageCount - 1;

  const items: (number | 'ellipsis')[] = [1];
  if (showLeftEllipsis) items.push('ellipsis');
  items.push(...range(left, right));
  if (showRightEllipsis) items.push('ellipsis');
  items.push(pageCount);
  return items;
}

export const Pagination = React.forwardRef<HTMLElement, PaginationProps>(
  ({ className, page, pageCount, onPageChange, siblings = 1, ...props }, ref) => {
    const items = buildPages(page, pageCount, siblings);

    const go = (p: number) => {
      if (p < 1 || p > pageCount || p === page) return;
      onPageChange(p);
    };

    return (
      <nav
        ref={ref}
        aria-label="Pagination"
        className={cn('flex items-center gap-1', className)}
        {...props}
      >
        <Button
          color="neutral"
          variant="ghost"
          size="sm"
          shape="square"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => go(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {items.map((it, idx) =>
          it === 'ellipsis' ? (
            <span
              key={`e-${idx}`}
              aria-hidden
              className="inline-flex h-8 w-8 items-center justify-center text-[var(--color-text-tertiary)]"
            >
              <MoreHorizontal className="h-4 w-4" />
            </span>
          ) : (
            <Button
              key={it}
              color={it === page ? 'module' : 'neutral'}
              variant={it === page ? 'solid' : 'ghost'}
              size="sm"
              shape="square"
              aria-current={it === page ? 'page' : undefined}
              aria-label={`Page ${it}`}
              onClick={() => go(it)}
            >
              {it}
            </Button>
          )
        )}

        <Button
          color="neutral"
          variant="ghost"
          size="sm"
          shape="square"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    );
  }
);
Pagination.displayName = 'Pagination';
