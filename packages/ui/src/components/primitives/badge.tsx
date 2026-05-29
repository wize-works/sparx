import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
        primary: 'bg-[var(--sparx-primary-tint)] text-[var(--sparx-primary)]',
        success: 'bg-[var(--color-success-tint)] text-[var(--color-success-text)]',
        warning: 'bg-[var(--color-warning-tint)] text-[var(--color-warning-text)]',
        danger: 'bg-[var(--color-danger-tint)] text-[var(--color-danger-text)]',
        module: 'bg-[var(--module-active-tint)] text-[var(--module-active-text)]',
        outline: 'border border-[var(--color-border-default)] text-[var(--color-text-secondary)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
);
Badge.displayName = 'Badge';

export { badgeVariants };
