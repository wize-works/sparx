'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../../utils/cn';
import { colorClass, type ColorKey } from '../_recipes/variants';

export interface SliderProps extends Omit<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  'color'
> {
  /** Range/thumb color (default `module` — adopts the wrapping ModuleProvider
   *  color, preserving prior behaviour). Accepts any palette/custom slot. */
  color?: ColorKey | (string & {});
}

// The filled range and thumb read --c-bg from the `.sx-c-{color}` role class.
export const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, SliderProps>(
  ({ className, color = 'module', ...props }, ref) => {
    // Multi-thumb sliders pass `value` as number[]; default to a single thumb
    // when the consumer didn't provide one explicitly.
    const value = props.value ?? props.defaultValue ?? [0];

    return (
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          colorClass(color),
          'relative flex w-full touch-none items-center select-none',
          'data-[disabled]:opacity-50',
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--color-bg-muted)]">
          <SliderPrimitive.Range className="absolute h-full bg-[var(--c-bg)]" />
        </SliderPrimitive.Track>
        {value.map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            className={cn(
              'block h-4 w-4 rounded-full border-2 border-[var(--c-bg)] bg-[var(--color-bg-surface)]',
              'transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:outline-none',
              'disabled:pointer-events-none disabled:opacity-50'
            )}
          />
        ))}
      </SliderPrimitive.Root>
    );
  }
);
Slider.displayName = SliderPrimitive.Root.displayName;
