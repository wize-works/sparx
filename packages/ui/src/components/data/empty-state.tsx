import * as React from 'react';
import { cn } from '../../utils/cn';

// EmptyState — zero-state UI for empty lists, no-results screens, etc.
// Compose with action buttons via children.

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Optional action area (typically one or two Buttons). */
  action?: React.ReactNode;
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed',
        'border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]',
        'px-6 py-10 text-center',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-surface)] text-[var(--color-text-tertiary)]">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
        {description && (
          <p className="max-w-sm text-xs text-[var(--color-text-secondary)]">{description}</p>
        )}
      </div>
      {action && <div className="mt-2 flex items-center gap-2">{action}</div>}
    </div>
  )
);
EmptyState.displayName = 'EmptyState';
