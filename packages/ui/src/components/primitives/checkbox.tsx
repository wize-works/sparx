'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '../../utils/cn';

// Uses --sparx-primary for the checked state (matches spec — not module-aware
// because checkboxes appear in module-neutral contexts like data tables).
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
      'border-[var(--color-border-strong)] bg-[var(--color-bg-surface)]',
      'transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-[var(--sparx-primary)] data-[state=checked]:bg-[var(--sparx-primary)] data-[state=checked]:text-white',
      'data-[state=indeterminate]:border-[var(--sparx-primary)] data-[state=indeterminate]:bg-[var(--sparx-primary)] data-[state=indeterminate]:text-white',
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      {props.checked === 'indeterminate' ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check className="h-3 w-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
