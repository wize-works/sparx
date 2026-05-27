import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const dividerVariants = cva('bg-[var(--color-border-default)] shrink-0', {
  variants: {
    orientation: {
      horizontal: 'h-px w-full',
      vertical: 'w-px self-stretch',
    },
  },
  defaultVariants: { orientation: 'horizontal' },
});

export interface DividerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'>,
    VariantProps<typeof dividerVariants> {
  /** When true (default), exposed to assistive tech as a separator. */
  decorative?: boolean;
}

export const Divider = React.forwardRef<HTMLDivElement, DividerProps>(
  ({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
    <div
      ref={ref}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : (orientation ?? 'horizontal')}
      className={cn(dividerVariants({ orientation }), className)}
      {...props}
    />
  )
);
Divider.displayName = 'Divider';
