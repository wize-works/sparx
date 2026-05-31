import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { colorClass, type ColorKey } from '../_recipes/variants';

// StatusDot — a small presence/status indicator dot (docs/35 Tier-A). Reads
// --c-bg from the `.sx-c-{color}` role class; optional pulse halo.

const dotVariants = cva('inline-block rounded-full', {
  variants: {
    variant: {
      solid: 'bg-[var(--c-bg,var(--color-neutral))]',
      // Soft ring around a solid core — set on the wrapper; see render.
      soft: 'bg-[var(--c-bg,var(--color-neutral))]',
    },
    size: {
      sm: 'h-1.5 w-1.5',
      md: 'h-2 w-2',
      lg: 'h-2.5 w-2.5',
    },
  },
  defaultVariants: { variant: 'solid', size: 'md' },
});

export interface StatusDotProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>, VariantProps<typeof dotVariants> {
  /** Semantic color slot (default `neutral`). */
  color?: ColorKey | (string & {});
  /** Animate an expanding halo (e.g. "live"/"online"). */
  pulse?: boolean;
  /** Accessible label; when set the dot is exposed as a status to AT. */
  label?: string;
}

export const StatusDot = React.forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, color = 'neutral', variant, size, pulse = false, label, ...props }, ref) => (
    <span
      ref={ref}
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cn(colorClass(color), 'relative inline-flex', className)}
      {...props}
    >
      {pulse && (
        <span
          aria-hidden
          className={cn(dotVariants({ variant, size }), 'absolute inset-0 animate-ping opacity-75')}
        />
      )}
      <span aria-hidden className={dotVariants({ variant, size })} />
    </span>
  )
);
StatusDot.displayName = 'StatusDot';

export { dotVariants };
