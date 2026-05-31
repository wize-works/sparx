'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

// Accordion — collapsible sections (docs/35 Tier-C). Hand-authored (no Radix
// accordion dep) with proper button/aria-expanded/region semantics and a
// grid-rows open/close animation. Supports single (optionally collapsible) and
// multiple modes, controlled or uncontrolled.

type AccordionType = 'single' | 'multiple';
type AccordionVariant = 'bordered' | 'separated' | 'ghost';

interface AccordionContextValue {
  isOpen: (value: string) => boolean;
  toggle: (value: string) => void;
  variant: AccordionVariant;
}
const AccordionContext = React.createContext<AccordionContextValue | null>(null);

function useAccordionContext(): AccordionContextValue {
  const ctx = React.useContext(AccordionContext);
  if (!ctx) throw new Error('Accordion components must be used within <Accordion>');
  return ctx;
}

export interface AccordionProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue'> {
  type?: AccordionType;
  /** Single mode: allow closing the open item by clicking it again. */
  collapsible?: boolean;
  variant?: AccordionVariant;
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
}

export const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      className,
      type = 'single',
      collapsible = true,
      variant = 'bordered',
      value,
      defaultValue,
      onValueChange,
      children,
      ...props
    },
    ref
  ) => {
    const [internal, setInternal] = React.useState<string[]>(defaultValue ?? []);
    const open = value ?? internal;

    const setOpen = React.useCallback(
      (next: string[]) => {
        if (value === undefined) setInternal(next);
        onValueChange?.(next);
      },
      [value, onValueChange]
    );

    const toggle = React.useCallback(
      (v: string) => {
        const isOpen = open.includes(v);
        if (type === 'single') {
          setOpen(isOpen ? (collapsible ? [] : open) : [v]);
        } else {
          setOpen(isOpen ? open.filter((x) => x !== v) : [...open, v]);
        }
      },
      [open, type, collapsible, setOpen]
    );

    const ctx = React.useMemo<AccordionContextValue>(
      () => ({ isOpen: (v) => open.includes(v), toggle, variant }),
      [open, toggle, variant]
    );

    return (
      <AccordionContext.Provider value={ctx}>
        <div
          ref={ref}
          className={cn(
            variant === 'separated' && 'space-y-2',
            variant === 'bordered' &&
              'divide-y divide-[var(--color-border-default)] rounded-lg border border-[var(--color-border-default)]',
            className
          )}
          {...props}
        >
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = 'Accordion';

interface AccordionItemContextValue {
  value: string;
  open: boolean;
  contentId: string;
  triggerId: string;
}
const AccordionItemContext = React.createContext<AccordionItemContextValue | null>(null);

export interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ className, value, children, ...props }, ref) => {
    const { isOpen, variant } = useAccordionContext();
    const open = isOpen(value);
    const uid = React.useId();
    const ctx = React.useMemo<AccordionItemContextValue>(
      () => ({ value, open, contentId: `${uid}-content`, triggerId: `${uid}-trigger` }),
      [value, open, uid]
    );
    return (
      <AccordionItemContext.Provider value={ctx}>
        <div
          ref={ref}
          data-state={open ? 'open' : 'closed'}
          className={cn(
            variant === 'separated' &&
              'rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]',
            className
          )}
          {...props}
        >
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  }
);
AccordionItem.displayName = 'AccordionItem';

export const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const { toggle } = useAccordionContext();
  const item = React.useContext(AccordionItemContext);
  if (!item) throw new Error('AccordionTrigger must be used within <AccordionItem>');
  return (
    <button
      ref={ref}
      type="button"
      id={item.triggerId}
      aria-expanded={item.open}
      aria-controls={item.contentId}
      onClick={() => toggle(item.value)}
      className={cn(
        'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium',
        'text-[var(--color-text-primary)] transition-colors',
        'hover:bg-[var(--color-bg-subtle)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className={cn(
          'h-4 w-4 shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-200',
          item.open && 'rotate-180'
        )}
      />
    </button>
  );
});
AccordionTrigger.displayName = 'AccordionTrigger';

export const AccordionContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const item = React.useContext(AccordionItemContext);
  if (!item) throw new Error('AccordionContent must be used within <AccordionItem>');
  return (
    <div
      role="region"
      id={item.contentId}
      aria-labelledby={item.triggerId}
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        item.open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      {/* `inert` when closed removes the collapsed content from tab/AT order
          while keeping it in the DOM so the grid-rows animation can run. */}
      <div className="overflow-hidden" inert={!item.open ? true : undefined}>
        <div
          ref={ref}
          className={cn('px-4 pb-3 text-sm text-[var(--color-text-secondary)]', className)}
          {...props}
        >
          {children}
        </div>
      </div>
    </div>
  );
});
AccordionContent.displayName = 'AccordionContent';
