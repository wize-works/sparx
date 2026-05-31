'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { Spinner } from './spinner';
import { colorClass, treatmentVariants, type ColorKey } from '../_recipes/variants';

// Button — the four-axis API (docs/35). `color` (semantic palette, runtime-
// extensible) is applied as a role-var class; `variant` (treatment), `size` and
// `shape` are CVA variants. color × variant composes through the --c-* role vars.

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center',
    'rounded-md font-medium',
    'transition-[color,background-color,border-color,filter] duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-40',
    'whitespace-nowrap select-none',
  ],
  {
    variants: {
      variant: treatmentVariants,
      size: {
        xs: 'h-7 gap-1.5 px-2.5 text-xs',
        sm: 'h-8 gap-1.5 px-3 text-sm',
        md: 'h-9 gap-2 px-4 text-sm',
        lg: 'h-10 gap-2 px-5 text-base',
        xl: 'h-11 gap-2.5 px-6 text-base',
      },
      shape: {
        default: '',
        // Extra horizontal presence for a hero / primary action.
        wide: 'min-w-32',
        // Fills its container.
        block: 'w-full',
        // 1:1 icon button, field radius.
        square: 'aspect-square p-0',
        // 1:1 icon button, fully round.
        circle: 'aspect-square rounded-full p-0',
      },
    },
    defaultVariants: { variant: 'solid', size: 'md', shape: 'default' },
  }
);

export interface ButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /** Semantic color slot. Known slots autocomplete; any string is accepted so
   *  a runtime custom theme color (`color="brand-mint"`) works once its
   *  `.sx-c-brand-mint` rule exists. Defaults to `primary`. */
  color?: ColorKey | (string & {});
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      color = 'primary',
      variant,
      size,
      shape,
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
    const classes = cn(colorClass(color), buttonVariants({ variant, size, shape }), className);

    // Radix Slot requires exactly one child element — defer all content to it
    // and skip the icon/spinner slots. The provided child owns its layout.
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
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
