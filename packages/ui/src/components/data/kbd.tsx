import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

// Kbd — a keyboard-key hint chip (docs/35 Tier-C). Renders a <kbd>.

const kbdVariants = cva(
  [
    'inline-flex items-center justify-center rounded',
    'border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)]',
    'font-mono font-medium text-[var(--color-text-secondary)]',
    'shadow-[0_1px_0_0_var(--color-border-strong)]',
  ],
  {
    variants: {
      size: {
        sm: 'h-4 min-w-4 px-1 text-[0.625rem]',
        md: 'h-5 min-w-5 px-1.5 text-xs',
        lg: 'h-6 min-w-6 px-2 text-sm',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export interface KbdProps
  extends React.HTMLAttributes<HTMLElement>, VariantProps<typeof kbdVariants> {}

export const Kbd = React.forwardRef<HTMLElement, KbdProps>(({ className, size, ...props }, ref) => (
  <kbd ref={ref} className={cn(kbdVariants({ size }), className)} {...props} />
));
Kbd.displayName = 'Kbd';

export { kbdVariants };
