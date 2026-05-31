'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../utils/cn';
import { colorClass, type ColorKey } from '../_recipes/variants';

const SIZES = {
  sm: { box: 'h-3.5 w-3.5', icon: 'h-2.5 w-2.5' },
  md: { box: 'h-4 w-4', icon: 'h-3 w-3' },
  lg: { box: 'h-5 w-5', icon: 'h-3.5 w-3.5' },
} as const;

export interface CheckboxProps extends Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  'color'
> {
  /** Checked-state color (default `primary`). Accepts any palette/custom slot. */
  color?: ColorKey | (string & {});
  size?: keyof typeof SIZES;
}

// Checked state reads --c-bg from the `.sx-c-{color}` role class (default
// primary — matches the prior --sparx-primary behaviour).
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, color = 'primary', size = 'md', ...props }, ref) => {
  const s = SIZES[size];
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        colorClass(color),
        'peer inline-flex shrink-0 items-center justify-center rounded-sm border',
        s.box,
        'border-[var(--color-border-strong)] bg-[var(--color-bg-surface)]',
        'transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-[var(--c-bg)] data-[state=checked]:bg-[var(--c-bg)] data-[state=checked]:text-[var(--c-fg)]',
        'data-[state=indeterminate]:border-[var(--c-bg)] data-[state=indeterminate]:bg-[var(--c-bg)] data-[state=indeterminate]:text-[var(--c-fg)]',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {props.checked === 'indeterminate' ? (
          <Minus className={s.icon} strokeWidth={3} />
        ) : (
          <Check className={s.icon} strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = 'Checkbox';
