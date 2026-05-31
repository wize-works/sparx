'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '../../utils/cn';
import { colorClass, type ColorKey } from '../_recipes/variants';

const SIZES = {
  sm: { track: 'h-4 w-7', thumb: 'h-3 w-3', on: 'data-[state=checked]:translate-x-3' },
  md: { track: 'h-5 w-9', thumb: 'h-4 w-4', on: 'data-[state=checked]:translate-x-4' },
  lg: { track: 'h-6 w-11', thumb: 'h-5 w-5', on: 'data-[state=checked]:translate-x-5' },
} as const;

export interface SwitchProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>,
  'color'
> {
  /** On-state track color (default `module` — adopts the wrapping
   *  ModuleProvider color, preserving prior behaviour). */
  color?: ColorKey | (string & {});
  size?: keyof typeof SIZES;
}

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, color = 'module', size = 'md', ...props }, ref) => {
    const s = SIZES[size];
    return (
      <SwitchPrimitive.Root
        ref={ref}
        className={cn(
          colorClass(color),
          'peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
          s.track,
          'transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[state=unchecked]:bg-[var(--color-bg-muted)]',
          'data-[state=checked]:bg-[var(--c-bg)]',
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block rounded-full bg-white shadow-sm',
            s.thumb,
            'transition-transform duration-150',
            'data-[state=unchecked]:translate-x-0',
            s.on
          )}
        />
      </SwitchPrimitive.Root>
    );
  }
);
Switch.displayName = 'Switch';
