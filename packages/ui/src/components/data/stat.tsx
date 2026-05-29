import * as React from 'react';
import { cn } from '../../utils/cn';

// Stat — metric card per doc 23 §8. Single visual style (no CVA variants).
// Icon tint uses --module-active so a wrapping ModuleProvider colors it.

export interface StatDelta {
  value: string;
  trend: 'up' | 'down' | 'neutral';
}

export interface StatProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  label: string;
  value: React.ReactNode;
  delta?: StatDelta;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
}

export const Stat = React.forwardRef<HTMLDivElement, StatProps>(
  ({ className, label, value, delta, icon, hint, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg bg-[var(--color-bg-subtle)] p-4', className)}
      {...props}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium tracking-wider text-[var(--color-text-tertiary)] uppercase">
          {label}
        </p>
        {icon && (
          <div className="rounded-md bg-[var(--module-active-tint)] p-1.5 text-[var(--module-active)]">
            {icon}
          </div>
        )}
      </div>
      <p className="text-2xl font-medium text-[var(--color-text-primary)]">{value}</p>
      {delta && (
        <p
          className={cn(
            'mt-1 text-xs',
            delta.trend === 'up' && 'text-[var(--color-success-text)]',
            delta.trend === 'down' && 'text-[var(--color-danger-text)]',
            delta.trend === 'neutral' && 'text-[var(--color-text-tertiary)]'
          )}
        >
          {delta.value}
        </p>
      )}
      {hint && !delta && <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{hint}</p>}
    </div>
  )
);
Stat.displayName = 'Stat';
