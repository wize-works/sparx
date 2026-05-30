'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

// Sidebar chrome for the dashboard. SidebarItem is the module-aware row —
// active items adopt --module-active so the wrapping ModuleProvider drives
// the highlight color automatically.

export const Sidebar = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, ...props }, ref) => (
    <aside
      ref={ref}
      className={cn(
        'flex h-full w-56 shrink-0 flex-col gap-1 border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3',
        className
      )}
      {...props}
    />
  )
);
Sidebar.displayName = 'Sidebar';

export const SidebarHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-2 pt-1 pb-3', className)} {...props} />
);
SidebarHeader.displayName = 'SidebarHeader';

export const SidebarSection = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-0.5 py-2', className)} {...props} />
);
SidebarSection.displayName = 'SidebarSection';

export const SidebarSectionLabel = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'px-2 pb-1 text-xs font-medium tracking-wider text-[var(--color-text-tertiary)] uppercase',
      className
    )}
    {...props}
  />
);
SidebarSectionLabel.displayName = 'SidebarSectionLabel';

export const SidebarFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('mt-auto border-t border-[var(--color-border-default)] pt-2', className)}
    {...props}
  />
);
SidebarFooter.displayName = 'SidebarFooter';

const sidebarItemVariants = cva(
  [
    'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium',
    'transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-40',
  ],
  {
    variants: {
      active: {
        false:
          'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]',
        true: 'bg-[var(--module-active-tint)] text-[var(--module-active-text)]',
      },
    },
    defaultVariants: { active: false },
  }
);

export interface SidebarItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof sidebarItemVariants> {
  icon?: React.ReactNode;
  /** When true, the item is rendered into the polymorphic child (e.g. a Next.js Link). */
  asChild?: boolean;
}

export const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, active, icon, asChild = false, children, ...props }, ref) => {
    const dataActive = active ? true : undefined;
    const ariaCurrent = active ? 'page' : undefined;
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(sidebarItemVariants({ active }), className)}
          data-active={dataActive}
          aria-current={ariaCurrent}
          {...props}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        type="button"
        className={cn(sidebarItemVariants({ active }), className)}
        data-active={dataActive}
        aria-current={ariaCurrent}
        {...props}
      >
        {icon && (
          <span
            className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center',
              active
                ? 'text-[var(--module-active)]'
                : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'
            )}
          >
            {icon}
          </span>
        )}
        <span className="flex-1 truncate text-left">{children}</span>
      </button>
    );
  }
);
SidebarItem.displayName = 'SidebarItem';

export { sidebarItemVariants };
