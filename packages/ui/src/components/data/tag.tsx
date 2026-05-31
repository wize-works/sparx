'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { chipTreatmentVariants, colorClass, type ColorKey } from '../_recipes/variants';

// Tag is the removable-chip cousin of Badge — used for active filters, applied
// labels, multi-select pills. Same color × variant × size axes (docs/35), plus
// an inline remove button.

const tagVariants = cva('inline-flex items-center gap-1 rounded-sm font-medium', {
  variants: {
    variant: {
      solid: chipTreatmentVariants.solid,
      soft: chipTreatmentVariants.soft,
      outline: chipTreatmentVariants.outline,
    },
    size: {
      sm: 'px-1.5 py-0.5 text-[0.625rem]',
      md: 'px-2 py-0.5 text-xs',
      lg: 'px-2.5 py-1 text-sm',
    },
  },
  defaultVariants: { variant: 'soft', size: 'md' },
});

export interface TagProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>, VariantProps<typeof tagVariants> {
  /** Semantic color slot (known slots autocomplete; any string accepted for
   *  runtime custom theme colors). Defaults to `neutral`. */
  color?: ColorKey | (string & {});
  /** When provided, shows an inline remove button. */
  onRemove?: () => void;
  removeLabel?: string;
}

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  (
    {
      className,
      color = 'neutral',
      variant,
      size,
      onRemove,
      removeLabel = 'Remove',
      children,
      ...props
    },
    ref
  ) => (
    <span
      ref={ref}
      className={cn(colorClass(color), tagVariants({ variant, size }), className)}
      {...props}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={cn(
            'ml-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm',
            'opacity-70 hover:opacity-100',
            'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none'
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
);
Tag.displayName = 'Tag';

export { tagVariants };
