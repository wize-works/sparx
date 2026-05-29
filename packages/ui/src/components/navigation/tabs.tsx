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
const TabsListVariantContext = React.createContext<TabsListVariant>('default');

export interface TabsListProps
  extends
    React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = 'default', children, ...props }, ref) => (
  <TabsListVariantContext.Provider value={variant ?? 'default'}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  </TabsListVariantContext.Provider>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const triggerByVariant: Record<TabsListVariant, string> = {
  default: cn(
    'relative -mb-px inline-flex h-9 items-center px-3 text-sm font-medium',
    'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
    'border-b-2 border-transparent transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-40',
    'data-[state=active]:border-[var(--module-active)] data-[state=active]:text-[var(--module-active-text)]'
  ),
  pills: cn(
    'inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium',
    'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
    'transition-colors duration-150',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
    'disabled:pointer-events-none disabled:opacity-40',
    'data-[state=active]:bg-[var(--color-bg-surface)] data-[state=active]:text-[var(--color-text-primary)] data-[state=active]:shadow-sm'
  ),
};

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsListVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(triggerByVariant[variant], className)}
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
