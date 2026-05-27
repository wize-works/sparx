import * as React from 'react';
import { cn } from '../../utils/cn';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden
      className={cn('animate-pulse rounded-md bg-[var(--color-bg-muted)]', className)}
      {...props}
    />
  )
);
Skeleton.displayName = 'Skeleton';
