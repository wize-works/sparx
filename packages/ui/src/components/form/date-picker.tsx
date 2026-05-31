'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '../overlay/popover';
import { Calendar } from './calendar';

// Single-date picker: button shows formatted value, click opens Popover with
// a Calendar inside. Controlled-only API to keep the surface tight; consumers
// own the state.

export interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  /** date-fns format string. Default: 'PPP' (e.g. "May 27, 2026"). */
  dateFormat?: string;
  disabled?: boolean;
  className?: string;
  /** Aria-label for the trigger button when no value is set. */
  ariaLabel?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  dateFormat = 'PPP',
  disabled,
  className,
  ariaLabel,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          color="neutral"
          variant="outline"
          disabled={disabled}
          aria-label={value ? format(value, dateFormat) : (ariaLabel ?? placeholder)}
          className={cn(
            'w-full justify-start gap-2 font-normal',
            !value && 'text-[var(--color-text-tertiary)]',
            className
          )}
          leftIcon={<CalendarIcon className="h-4 w-4" />}
        >
          {value ? format(value, dateFormat) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* autoFocus is correct UX here — the popover just opened from the user's
            click, focus should land in the calendar for keyboard date navigation. */}
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <Calendar mode="single" selected={value} onSelect={onChange} autoFocus />
      </PopoverContent>
    </Popover>
  );
}
