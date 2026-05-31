import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { chipTreatmentVariants, colorClass, type ColorKey } from '../_recipes/variants';

// Badge — status pill on the shared color × variant × size axes (docs/35).
// Default `neutral / soft` matches the old `default` variant.

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap',
  {
    variants: {
      variant: chipTreatmentVariants,
      size: {
        sm: 'px-1.5 py-0.5 text-[0.625rem]',
        md: 'px-2 py-0.5 text-xs',
        lg: 'px-2.5 py-1 text-sm',
      },
    },
    defaultVariants: { variant: 'soft', size: 'md' },
  }
);

export interface BadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>, VariantProps<typeof badgeVariants> {
  /** Semantic color slot (known slots autocomplete; any string accepted for
   *  runtime custom theme colors). Defaults to `neutral`. */
  color?: ColorKey | (string & {});
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, color = 'neutral', variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(colorClass(color), badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';

export { badgeVariants };
