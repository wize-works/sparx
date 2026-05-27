'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Modal, ModalContent, ModalDescription, ModalPortal, ModalTitle } from './modal';

// CommandPalette is the ⌘K global search per doc 23 §9. We expose two layers:
//   - Command*: the styled primitives wrapping cmdk — use these for inline
//     command UIs (e.g. inside a Popover for a searchable Combobox).
//   - CommandPalette: a ready-made Modal-wrapped ⌘K palette.

export const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-md bg-[var(--color-bg-surface)]',
      className
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

export const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] px-3">
    <Search className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-10 w-full bg-transparent py-2 text-sm outline-none',
        'placeholder:text-[var(--color-text-tertiary)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

export const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-80 overflow-y-auto p-1', className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

export const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className={cn(
      'py-6 text-center text-sm text-[var(--color-text-secondary)]',
      className
    )}
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

export const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden text-[var(--color-text-primary)]',
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
      '[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium',
      '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider',
      '[&_[cmdk-group-heading]]:text-[var(--color-text-tertiary)]',
      className
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

export const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-[var(--color-border-default)]', className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
      'text-[var(--color-text-primary)]',
      'transition-colors duration-100',
      'data-[selected=true]:bg-[var(--color-bg-subtle)]',
      'aria-disabled:pointer-events-none aria-disabled:opacity-40',
      className
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

export const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'ml-auto text-xs tracking-wide text-[var(--color-text-tertiary)]',
      className
    )}
    {...props}
  />
);
CommandShortcut.displayName = 'CommandShortcut';

// ── CommandPalette ─────────────────────────────────────────
// Drop-in ⌘K palette. Listens for cmd/ctrl+K when uncontrolled.

export interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  /** Default true — when uncontrolled, listens for ⌘K / Ctrl+K to toggle. */
  enableShortcut?: boolean;
  placeholder?: string;
}

export function CommandPalette({
  open: controlledOpen,
  onOpenChange,
  children,
  enableShortcut = true,
  placeholder = 'Type a command or search…',
}: CommandPaletteProps) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (!isControlled) setInternalOpen(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange]
  );

  React.useEffect(() => {
    if (!enableShortcut) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enableShortcut, open, setOpen]);

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent className="overflow-hidden p-0" hideClose>
        {/* Title + description are visually hidden but exposed to screen
            readers — Radix Dialog requires them for accessibility. */}
        <ModalTitle className="sr-only">Command palette</ModalTitle>
        <ModalDescription className="sr-only">
          Search pages and actions, or use arrow keys to navigate.
        </ModalDescription>
        <Command>
          <CommandInput placeholder={placeholder} />
          {children}
        </Command>
      </ModalContent>
    </Modal>
  );
}
CommandPalette.displayName = 'CommandPalette';

// Re-export ModalPortal for consumers who want to host the palette via the
// same portal target as other Modals (rare).
export { ModalPortal as CommandPalettePortal };
