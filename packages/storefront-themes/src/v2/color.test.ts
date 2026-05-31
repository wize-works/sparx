import { describe, expect, it } from 'vitest';
import { contrastRatio, deriveContent, normalizeHex, relativeLuminance } from './color';

describe('normalizeHex', () => {
  it('expands shorthand and lowercases', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('4F46E5')).toBe('#4f46e5');
    expect(normalizeHex('  #FFFFFF ')).toBe('#ffffff');
  });

  it('returns null for non-hex input', () => {
    expect(normalizeHex('rebeccapurple')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex(null)).toBeNull();
    expect(normalizeHex('#12')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for identical colors', () => {
    expect(contrastRatio('#4f46e5', '#4f46e5')).toBeCloseTo(1, 5);
  });
});

describe('relativeLuminance', () => {
  it('bounds at black and white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('deriveContent', () => {
  it('picks white on a dark/saturated brand color', () => {
    expect(deriveContent('#4f46e5')).toBe('#ffffff'); // indigo
    expect(deriveContent('#0b1120')).toBe('#ffffff'); // near-black surface
  });

  it('picks near-black on a light surface', () => {
    expect(deriveContent('#ffffff')).toBe('#0a0a0a');
    expect(deriveContent('#f1f5f9')).toBe('#0a0a0a');
    expect(deriveContent('#fbbf24')).toBe('#0a0a0a'); // amber warning
  });

  it('always returns the higher-contrast of the two inks', () => {
    const base = '#777777';
    const chosen = deriveContent(base);
    const other = chosen === '#ffffff' ? '#0a0a0a' : '#ffffff';
    expect(contrastRatio(base, chosen)).toBeGreaterThanOrEqual(contrastRatio(base, other));
  });
});
