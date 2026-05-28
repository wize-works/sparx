'use client';

import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const inputVariants = cva(
  [
    'flex w-full rounded-md border bg-[var(--color-bg-surface)]',
    'text-sm text-[var(--color-text-primary)]',
    'placeholder:text-[var(--color-text-tertiary)]',
    'transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'file:border-0 file:bg-transparent file:text-sm file:font-medium',
  ],
  {
    variants: {
      variant: {
        default: 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]',
        error: 'border-[var(--color-danger)] focus-visible:ring-[var(--color-danger)]',
      },
      size: {
        sm: 'h-8 px-2.5 py-1.5 text-xs',
        md: 'h-9 px-3 py-2',
        lg: 'h-10 px-4 py-2.5 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

// Native HTML <input> has a numeric `size` attribute — we omit it so our CVA
// `size` variant ('sm' | 'md' | 'lg') takes precedence with no conflict.
export interface InputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(inputVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { inputVariants };
