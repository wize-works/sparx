import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters falsy values', () => {
    expect(cn('foo', false, null, undefined, '', 'bar')).toBe('foo bar');
  });

  it('applies conditional classes via object syntax', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  it('dedupes conflicting Tailwind classes — last one wins', () => {
    expect(cn('px-4', 'px-6')).toBe('px-6');
    expect(cn('text-sm text-gray-500', 'text-lg')).toBe('text-gray-500 text-lg');
  });
});
