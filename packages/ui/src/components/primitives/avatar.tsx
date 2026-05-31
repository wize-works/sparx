'use client';

import * as React from 'react';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

const avatarVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-[var(--color-bg-subtle)] text-[var(--color-text-secondary)] select-none',
  {
    variants: {
      size: {
        sm: 'h-6 w-6 text-xs',
        md: 'h-8 w-8 text-sm',
        lg: 'h-10 w-10 text-base',
        xl: 'h-12 w-12 text-lg',
      },
      // `shape` aligned with Button's geometry vocabulary.
      shape: {
        circle: 'rounded-full',
        square: 'rounded-md',
      },
    },
    defaultVariants: { size: 'md', shape: 'circle' },
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
  ({ className, size, shape, src, alt, initials, children, ...props }, ref) => {
    const [errored, setErrored] = React.useState(false);
    const showImage = src && !errored;
    const fallback = initials ?? deriveInitials(alt);

    return (
      <span ref={ref} className={cn(avatarVariants({ size, shape }), className)} {...props}>
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
