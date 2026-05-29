'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '../../utils/cn';

// Styled wrapper around react-day-picker v10. Selected day adopts
// --module-active so it tints inside a ModuleProvider.

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'flex flex-col gap-3',
        month_caption: 'relative flex h-7 items-center justify-center',
        caption_label: 'text-sm font-medium text-[var(--color-text-primary)]',
        nav: 'absolute inset-x-0 top-3 flex items-center justify-between px-3',
        button_previous: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md',
          'border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]',
          'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]',
          'transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-40'
        ),
        button_next: cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md',
          'border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]',
          'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-primary)]',
          'transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-40'
        ),
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'flex-1 text-center text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)] pb-2',
        week: 'flex w-full mt-1',
        day: cn(
          'relative flex flex-1 items-center justify-center p-0 text-sm',
          'focus-within:relative focus-within:z-20'
        ),
        day_button: cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm',
          'text-[var(--color-text-primary)]',
          'transition-colors duration-150',
          'hover:bg-[var(--color-bg-subtle)]',
          'focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none'
        ),
        selected:
          '[&_button]:bg-[var(--module-active)] [&_button]:text-white [&_button]:hover:bg-[var(--module-active)]',
        today:
          '[&_button]:bg-[var(--color-bg-subtle)] [&_button]:font-medium [&_button]:text-[var(--color-text-primary)]',
        outside: '[&_button]:text-[var(--color-text-tertiary)] [&_button]:opacity-50',
        disabled: '[&_button]:pointer-events-none [&_button]:opacity-40',
        range_middle:
          '[&_button]:bg-[var(--module-active-tint)] [&_button]:text-[var(--module-active-text)]',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';
