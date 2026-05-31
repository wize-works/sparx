import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { colorClass, type ColorKey } from '../_recipes/variants';

const cardVariants = cva(
  'rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]',
  {
    variants: {
      variant: {
        default: '',
        // The top stripe reads --c-bg from the `accent` color (falls back to
        // the active module color when no accent is set).
        module: 'rounded-t-none border-t-[3px] border-t-[var(--c-bg,var(--module-active))]',
        elevated: 'shadow-md',
        ghost: 'border-transparent bg-transparent',
        subtle: 'border-transparent bg-[var(--color-bg-subtle)]',
      },
      padding: {
        none: '',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
    },
    defaultVariants: { variant: 'default', padding: 'md' },
  }
);

export interface CardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'color'>, VariantProps<typeof cardVariants> {
  /** Recolors the `module` variant's top stripe to any palette/custom color.
   *  Defaults to the active module color. */
  accent?: ColorKey | (string & {});
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, accent, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(accent && colorClass(accent), cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mb-3 flex flex-col gap-1', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-base font-medium text-[var(--color-text-primary)]', className)}
    {...props}
  >
    {children}
  </h3>
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-[var(--color-text-secondary)]', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('', className)} {...props} />
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'mt-4 flex items-center justify-end gap-2 border-t border-[var(--color-border-default)] pt-4',
        className
      )}
      {...props}
    />
  )
);
CardFooter.displayName = 'CardFooter';

export { cardVariants };
