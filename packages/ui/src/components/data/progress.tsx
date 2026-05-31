import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { colorClass, type ColorKey } from '../_recipes/variants';

// Progress — linear determinate/indeterminate bar (docs/35 Tier-A). The
// indicator fill reads --c-bg from the `.sx-c-{color}` role class. Omit `value`
// (or pass null) for the looping indeterminate state.

const progressVariants = cva('relative w-full overflow-hidden rounded-full', {
  variants: {
    variant: {
      solid: 'bg-[var(--color-bg-muted)]',
      soft: 'bg-[var(--c-tint,var(--color-bg-subtle))]',
    },
    size: {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
    },
  },
  defaultVariants: { variant: 'solid', size: 'md' },
});

export interface ProgressProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>,
    VariantProps<typeof progressVariants> {
  /** 0–`max`. Omit or pass null for the indeterminate (looping) state. */
  value?: number | null;
  max?: number;
  /** Semantic color slot for the fill (default `primary`). */
  color?: ColorKey | (string & {});
  /** Accessible label when there's no visible label element. */
  label?: string;
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, color = 'primary', variant, size, label, ...props }, ref) => {
    const indeterminate = value == null;
    const pct = indeterminate ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : value}
        aria-label={label}
        className={cn(colorClass(color), progressVariants({ variant, size }), className)}
        {...props}
      >
        <div
          className={cn(
            'h-full rounded-full bg-[var(--c-bg,var(--color-primary))]',
            indeterminate
              ? 'absolute top-0 [animation:sx-progress-indeterminate_1.4s_ease-in-out_infinite]'
              : 'transition-[width] duration-300'
          )}
          style={indeterminate ? undefined : { width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = 'Progress';

export { progressVariants };
