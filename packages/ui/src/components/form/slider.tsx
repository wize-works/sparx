'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../../utils/cn';

// Slider is module-aware — the filled range and thumb adopt --module-active
// so wrapping a settings panel in <ModuleProvider module="commerce"> shifts
// the slider's accent color to orange automatically.

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
  // Multi-thumb sliders pass `value` as number[]; default to a single thumb
  // when the consumer didn't provide one explicitly.
  const value = props.value ?? props.defaultValue ?? [0];

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        'relative flex w-full touch-none select-none items-center',
        'data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--color-bg-muted)]"
      >
        <SliderPrimitive.Range className="absolute h-full bg-[var(--module-active)]" />
      </SliderPrimitive.Track>
      {value.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            'block h-4 w-4 rounded-full border-2 border-[var(--module-active)] bg-[var(--color-bg-surface)]',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;
