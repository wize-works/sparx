import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

// NativeSelect — a styled native <select>. Unlike the Radix-based <Select>
// (controlled, rich content, posts no native form field), this is a real
// <select> that keeps native form semantics: `name`, `defaultValue`, and
// FormData submission all work. Use it for server-action forms and simple
// option lists; reach for <Select> when you need custom item rendering.
//
// Same border/focus/size tokens and default/error/success states as <Input> so
// the two line up visually in a form.

const nativeSelectVariants = cva(
  [
    'w-full appearance-none rounded-md border bg-[var(--color-bg-surface)]',
    'text-[var(--color-text-primary)]',
    'transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2 focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        default: 'border-[var(--color-border-default)] hover:border-[var(--color-border-strong)]',
        error: 'border-[var(--color-danger)] focus-visible:ring-[var(--color-danger)]',
        success: 'border-[var(--color-success)] focus-visible:ring-[var(--color-success)]',
      },
      // Right padding leaves room for the chevron overlay.
      size: {
        sm: 'h-8 py-1.5 pr-8 pl-2.5 text-xs',
        md: 'h-9 py-2 pr-9 pl-3 text-sm',
        lg: 'h-10 py-2.5 pr-10 pl-4 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
);

// Native <select> has a numeric `size` attribute — omit it so our CVA `size`
// variant ('sm' | 'md' | 'lg') takes precedence with no conflict.
export interface NativeSelectProps
  extends
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    VariantProps<typeof nativeSelectVariants> {}

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, variant, size, children, ...props }, ref) => (
    // `className` controls the wrapper (width/layout) — default full-width so it
    // fills a form field; pass `w-auto` for inline filter rows. The field
    // styling (border/bg/size) stays on the <select>.
    <span className={cn('relative inline-flex w-full items-center', className)}>
      <select
        ref={ref}
        className={cn(nativeSelectVariants({ variant, size }), 'w-full')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 h-4 w-4 shrink-0 opacity-50"
      />
    </span>
  )
);
NativeSelect.displayName = 'NativeSelect';

export { nativeSelectVariants };
