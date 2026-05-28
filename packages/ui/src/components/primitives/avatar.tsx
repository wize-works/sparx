'use client';

import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const avatarVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)]',
  {
    variants: {
      size: {
        sm: 'h-6 w-6 text-xs',
        md: 'h-8 w-8 text-sm',
        lg: 'h-10 w-10 text-base',
        xl: 'h-12 w-12 text-lg',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof avatarVariants> {
  src?: string;
  alt?: string;
  /** Two-letter fallback shown when the image is missing or fails to load. */
  initials?: string;
}

function deriveInitials(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size, src, alt, initials, children, ...props }, ref) => {
    const [errored, setErrored] = React.useState(false);
    const showImage = src && !errored;
    const fallback = initials ?? deriveInitials(alt);

    return (
      <span ref={ref} className={cn(avatarVariants({ size }), className)} {...props}>
        {showImage ? (
          <img
            src={src}
            alt={alt ?? ''}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        ) : (
          (children ?? <span className="font-medium">{fallback}</span>)
        )}
      </span>
    );
  }
);
Avatar.displayName = 'Avatar';

export { avatarVariants };
