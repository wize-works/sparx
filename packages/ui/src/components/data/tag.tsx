'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

// Tag is the removable-chip cousin of Badge — used for active filters, applied
// labels, multi-select pills. Includes an inline remove button.

const tagVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:
          'border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
        primary:
          'border-transparent bg-[var(--sparx-primary-tint)] text-[var(--sparx-primary)]',
        module:
          'border-transparent bg-[var(--module-active-tint)] text-[var(--module-active-text)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {
  /** When provided, shows an inline remove button. */
  onRemove?: () => void;
  removeLabel?: string;
}

export const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, variant, onRemove, removeLabel = 'Remove', children, ...props }, ref) => (
    <span ref={ref} className={cn(tagVariants({ variant }), className)} {...props}>
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={cn(
            'ml-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm',
            'opacity-70 hover:opacity-100',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]'
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
