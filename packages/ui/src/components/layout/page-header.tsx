import * as React from 'react';
import { cn } from '../../utils/cn';
import { Heading } from '../primitives/heading';

// PageHeader — the canonical working-area page header (docs/34 §5). One row:
// an optional module icon, the H1 title, an optional inline count/status badge,
// a muted description below, and right-aligned actions. Replaces the per-page
// hand-rolled Stack + Heading + Text headers so the anatomy stops drifting.
//
// Presentational only: `badge` and `actions` are slots — callers pass a Badge
// and their own Buttons, so this never couples to the Button/Badge API.

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Module icon, rendered in a --module-active tint tile. Omit on platform
   *  pages (Home, Settings index). */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** A single inline count/status pill (e.g. `<Badge>`). At most one. */
  badge?: React.ReactNode;
  /** One or two sentences, muted. */
  description?: React.ReactNode;
  /** Right-aligned actions — exactly one primary Button plus optional
   *  secondaries. Omit when the archetype's actions live elsewhere. */
  actions?: React.ReactNode;
}

export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  ({ className, icon, title, badge, description, actions, ...props }, ref) => (
    <header
      ref={ref}
      className={cn('mb-6 flex items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--module-active-tint)] text-[var(--module-active)]">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Heading level={1} className="truncate text-2xl">
              {title}
            </Heading>
            {badge}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
);
PageHeader.displayName = 'PageHeader';
