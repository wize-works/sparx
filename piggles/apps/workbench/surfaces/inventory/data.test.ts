// The words the stock screens put on a set of versions nobody has counted.
//
// This exists because the sentence carries a NUMBER the band does not hold. The
// band is handed a small window of the uncounted versions plus the server's
// total, and the useful sentence names a few and counts the rest — so the
// arithmetic is `total - shown`, never `codes.length - shown`. Counting what the
// window happens to hold would have told a shop with thirty-eight uncounted
// versions that it had twenty-five (issue 444).

import { describe, expect, it } from 'vitest';

import { countingMatters, listCodes } from './data';

describe('listCodes', () => {
  it('says nothing when there is nothing to name', () => {
    expect(listCodes([], 0)).toBe('');
  });

  it('names one on its own', () => {
    expect(listCodes(['ASH-OVERSHIRT-XS-MOSS'], 1)).toBe('ASH-OVERSHIRT-XS-MOSS.');
  });

  it('names up to three in a sentence', () => {
    expect(listCodes(['A-1', 'A-2'], 2)).toBe('A-1 and A-2.');
    expect(listCodes(['A-1', 'A-2', 'A-3'], 3)).toBe('A-1, A-2 and A-3.');
  });

  it('counts the rest from the SERVER total, not from what it is holding', () => {
    // Devi's real case: five uncounted, three named.
    expect(listCodes(['A-1', 'A-2', 'A-3', 'A-4', 'A-5'], 5)).toBe('A-1, A-2, A-3 and 2 more.');
    // And the whole-shop case: the window is twenty-five, the answer is 38.
    const window = Array.from({ length: 25 }, (_, i) => `A-${String(i + 1)}`);
    expect(listCodes(window, 38)).toBe('A-1, A-2, A-3 and 35 more.');
  });

  it('does not claim to have named more than it did', () => {
    // A window SHORTER than the total still names only what it holds and counts
    // the difference against the total — the band never invents a code.
    expect(listCodes(['A-1'], 9)).toBe('A-1 and 8 more.');
  });
});

describe('countingMatters', () => {
  const shipped = { requiresShipping: true };

  it('is true for a version that promises to stop selling when it runs out', () => {
    // The only broken promise: `deny` cannot fire while nothing was ever counted.
    expect(countingMatters({ inventoryPolicy: 'deny', ...shipped })).toBe(true);
  });

  it('is false for a version told to keep selling when out', () => {
    // Unlimited is what was ASKED for, so an uncounted one is behaving. On
    // 2026-09-08 the platform held 1,664 of these against 55 real ones, and
    // without this the band told a shop to count its memberships (issue 445).
    expect(countingMatters({ inventoryPolicy: 'continue', ...shipped })).toBe(false);
  });

  it('is false for a version that is never posted', () => {
    // A download or a service has no shelf, so it cannot be counted at all.
    expect(countingMatters({ inventoryPolicy: 'deny', requiresShipping: false })).toBe(false);
  });
});
