import * as React from 'react';
import { X } from 'lucide-react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';
import { colorClass, type ColorKey } from '../_recipes/variants';

// Alert — inline status banner on the shared color axis (docs/35 Tier-A).
// Treatments are alert-specific (no hover state) but read the same --c-* role
// vars set by the `.sx-c-{color}` class, so any palette/custom color works.

const alertVariants = cva('relative flex rounded-lg', {
  variants: {
    variant: {
      soft: 'bg-[var(--c-tint,var(--color-bg-subtle))] text-[var(--c-ink,var(--color-text-primary))]',
      solid:
        'bg-[var(--c-bg,var(--color-neutral))] text-[var(--c-fg,var(--color-neutral-content))]',
      outline:
        'border border-[var(--c-bg,var(--color-border-strong))] text-[var(--c-ink,var(--color-text-primary))]',
    },
    size: {
      sm: 'gap-2 p-3 text-xs',
      md: 'gap-3 p-4 text-sm',
      lg: 'gap-3 p-5 text-base',
    },
  },
  defaultVariants: { variant: 'soft', size: 'md' },
});

export interface AlertProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, 'color' | 'title'>,
    VariantProps<typeof alertVariants> {
  /** Semantic color slot (known slots autocomplete; any string accepted for
   *  runtime custom theme colors). Defaults to `info`. */
  color?: ColorKey | (string & {});
  /** Leading icon (e.g. a Lucide icon). Inherits the alert's text color. */
  icon?: React.ReactNode;
  /** Bold heading line above the body. */
  title?: React.ReactNode;
  /** When provided, renders a dismiss button. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      className,
      color = 'info',
      variant,
      size,
      icon,
      title,
      onDismiss,
      dismissLabel = 'Dismiss',
      children,
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      role="alert"
      className={cn(colorClass(color), alertVariants({ variant, size }), className)}
      {...props}
    >
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:h-[1.1em] [&>svg]:w-[1.1em]">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className={cn(
            '-mt-0.5 -mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm',
            'opacity-60 hover:opacity-100',
            'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none'
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
);
Alert.displayName = 'Alert';

export { alertVariants };
