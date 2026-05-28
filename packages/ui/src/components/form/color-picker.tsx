'use client';

import * as React from 'react';
import { cn } from '../../utils/cn';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from '../overlay/popover';

// Lightweight color picker — hex text input + a swatch button that opens a
// Popover with curated swatches. The native <input type="color"> isn't used
// directly because its styling can't be tokenized; we offer it as an "advanced"
// fallback via the keyboard hint. For now the curated palette covers the
// merchant-theme use cases (per docs/23 sparx + module colors).

const DEFAULT_SWATCHES: string[] = [
  // Brand
  '#6366F1',
  '#4F46E5',
  '#818CF8',
  // Module
  '#F97316',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#475569',
  '#EC4899',
  '#10B981',
  // Common merchant colors
  '#EF4444',
  '#F59E0B',
  '#84CC16',
  '#A855F7',
  '#000000',
  '#FFFFFF',
];

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (!v.startsWith('#')) v = `#${v}`;
  if (!HEX_PATTERN.test(v)) return null;
  if (v.length === 4) {
    // expand #abc → #aabbcc
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return v.toUpperCase();
}

export interface ColorPickerProps {
  value?: string;
  onChange?: (color: string) => void;
  swatches?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function ColorPicker({
  value,
  onChange,
  swatches = DEFAULT_SWATCHES,
  placeholder = '#000000',
  disabled,
  className,
  ariaLabel = 'Color',
}: ColorPickerProps) {
  // Track the raw input separately so the user can type partial hex.
  const [draft, setDraft] = React.useState(value ?? '');
  React.useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const commitDraft = () => {
    const normalized = normalizeHex(draft);
    if (normalized) {
      setDraft(normalized);
      onChange?.(normalized);
    } else if (value) {
      // revert on invalid input
      setDraft(value);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={`${ariaLabel} swatch`}
            className={cn(
              'h-9 w-9 shrink-0 rounded-md border border-[var(--color-border-default)]',
              'transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
            style={{ backgroundColor: value ?? 'transparent' }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="grid grid-cols-8 gap-1.5">
            {swatches.map((swatch) => {
              const isActive = value?.toUpperCase() === swatch.toUpperCase();
              return (
                <button
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  aria-pressed={isActive}
                  onClick={() => {
                    setDraft(swatch);
                    onChange?.(swatch);
                  }}
                  className={cn(
                    'h-6 w-6 rounded border transition-transform duration-100',
                    'hover:scale-110',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
                    isActive
                      ? 'ring-[var(--module-active)]/40 border-[var(--module-active)] ring-2'
                      : 'border-[var(--color-border-default)]'
                  )}
                  style={{ backgroundColor: swatch }}
                />
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitDraft();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className="font-mono uppercase"
      />
    </div>
  );
}
