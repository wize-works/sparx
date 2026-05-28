import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const codeVariants = cva(
  'rounded bg-[var(--color-bg-subtle)] font-mono text-[var(--color-text-primary)]',
  {
    variants: {
      variant: {
        inline: 'inline px-1.5 py-0.5 text-xs',
        block: 'block w-full overflow-x-auto p-4 text-xs leading-relaxed',
      },
    },
    defaultVariants: { variant: 'inline' },
  }
);

export interface CodeProps
  extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof codeVariants> {}

export const Code = React.forwardRef<HTMLElement, CodeProps>(
  ({ className, variant, children, ...props }, ref) => {
    if (variant === 'block') {
      return (
        <pre className={cn(codeVariants({ variant }), className)}>
          <code ref={ref} {...props}>
            {children}
          </code>
        </pre>
      );
    }
    return (
      <code ref={ref} className={cn(codeVariants({ variant }), className)} {...props}>
        {children}
      </code>
    );
  }
);
Code.displayName = 'Code';

export { codeVariants };
