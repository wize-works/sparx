'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cva, type VariantProps } from '../../utils/cva';
import { cn } from '../../utils/cn';

// Variant lives on the List so a single Tabs can opt in/out of the pill style.
// `module` variant routes the active indicator/background through
// --module-active so a wrapping ModuleProvider tints it correctly.

export const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva('inline-flex items-center', {
  variants: {
    variant: {
      default: 'gap-4 border-b border-[var(--color-border-default)]',
      pills: 'gap-1 rounded-md bg-[var(--color-bg-subtle)] p-1',
    },
  },
  defaultVariants: { variant: 'default' },
});

type TabsListVariant = NonNullable<VariantProps<typeof tabsListVariants>['variant']>;
type TabsSize = 'sm' | 'md' | 'lg';
const TabsListContext = React.createContext<{ variant: TabsListVariant; size: TabsSize }>({
  variant: 'default',
  size: 'md',
});

export interface TabsListProps
  extends
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {
  size?: TabsSize;
}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = 'default', size = 'md', children, ...props }, ref) => (
  <TabsListContext.Provider value={{ variant: variant ?? 'default', size }}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  </TabsListContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const SIZE_DEFAULT: Record<TabsSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
};
const SIZE_PILLS: Record<TabsSize, string> = {
  sm: 'h-6 px-2.5 text-xs',
  md: 'h-7 px-3 text-sm',
  lg: 'h-9 px-4 text-base',
};

function triggerClasses(variant: TabsListVariant, size: TabsSize): string {
  if (variant === 'pills') {
    return cn(
      'inline-flex items-center rounded-sm font-medium',
      SIZE_PILLS[size],
      'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
      'transition-colors duration-150',
      'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
      'disabled:pointer-events-none disabled:opacity-40',
      'data-[state=active]:bg-[var(--color-bg-surface)] data-[state=active]:text-[var(--color-text-primary)] data-[state=active]:shadow-sm'
    );
  }
  return cn(
    'relative -mb-px inline-flex items-center font-medium',
    SIZE_DEFAULT[size],
    'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
    'border-b-2 border-transparent transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-40',
    'data-[state=active]:border-[var(--module-active)] data-[state=active]:text-[var(--module-active-text)]'
  );
}

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const { variant, size } = React.useContext(TabsListContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(triggerClasses(variant, size), className)}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-4 focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { tabsListVariants };
