import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const spinnerVariants = cva('animate-spin', {
  variants: {
    size: {
      sm: 'h-3.5 w-3.5',
      md: 'h-4 w-4',
      lg: 'h-5 w-5',
    },
  },
  defaultVariants: { size: 'md' },
});

export interface SpinnerProps
  extends
    Omit<React.SVGAttributes<SVGSVGElement>, 'children'>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ size, className, label = 'Loading', ...props }, ref) => (
    <Loader2
      ref={ref}
      role="status"
      aria-label={label}
      className={cn(spinnerVariants({ size }), className)}
      {...props}
    />
  )
);
Spinner.displayName = 'Spinner';
