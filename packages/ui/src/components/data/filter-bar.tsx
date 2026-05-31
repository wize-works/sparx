import * as React from 'react';
import { cn } from '../../utils/cn';

// FilterBar — the standard list toolbar (docs/34 §7.1). Layout only: a leading
// search control that spans the row, inline filter controls, and a trailing
// slot (typically a sort Select) pinned right. Wraps to stacked rows below the
// container's width.
//
// Filtering is live/debounced — there is no "Apply" button. Debouncing and
// state are the caller's concern; this primitive owns arrangement only.

export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Leading search control (typically an `<Input>`). Spans the free space. */
  search?: React.ReactNode;
  /** Trailing controls (typically a sort `<Select>`), pinned to the right. */
  trailing?: React.ReactNode;
  /** Filter controls (Selects, segmented toggles) between search and trailing. */
  children?: React.ReactNode;
}

export const FilterBar = React.forwardRef<HTMLDivElement, FilterBarProps>(
  ({ className, search, trailing, children, ...props }, ref) => (
    <div
      ref={ref}
      role="search"
      className={cn('mb-4 flex flex-wrap items-center gap-2', className)}
      {...props}
    >
      {search && <div className="min-w-48 flex-1">{search}</div>}
      {children}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
);
FilterBar.displayName = 'FilterBar';
