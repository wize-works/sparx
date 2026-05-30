'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { Spinner } from './spinner';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-md text-sm font-medium',
    'transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-40',
    'whitespace-nowrap select-none',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-[var(--sparx-primary)] text-white hover:bg-[var(--sparx-primary-hover)]',
        secondary:
          'border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-subtle)]',
        ghost:
          'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]',
        link: 'h-auto p-0 text-[var(--sparx-primary)] underline-offset-4 hover:underline',
        danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
        warning: 'bg-[var(--color-warning)] text-white hover:opacity-90',
        module: 'bg-[var(--module-active)] text-white hover:opacity-90',
        'module-outline':
          'border border-[var(--module-active)] text-[var(--module-active)] hover:bg-[var(--module-active-tint)]',
      },
      size: {
        xs: 'h-7 px-2.5 text-xs',
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-5 text-base',
        xl: 'h-11 px-6 text-base',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-md': 'h-9 w-9 p-0',
        'icon-lg': 'h-10 w-10 p-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      leftIcon,
      rightIcon,
      asChild = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // Radix Slot requires exactly one child element — defer all content to it
    // and skip the icon/spinner slots. The provided child owns its layout.
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner size="sm" /> : leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && !loading && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
