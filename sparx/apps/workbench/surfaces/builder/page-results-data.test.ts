// "Nobody bought anything" versus "we cannot tell where the sales came from".
//
// Pinned because the report told an owner who had taken fourteen orders that not
// one page she built had sold anything (issue 359). The two states render
// identically — every row reads `0 (0%)` — so the only thing separating a
// measurement from an absence is this predicate.

import { describe, expect, it } from 'vitest';
import { salesUntraced } from './page-results-data';
import type { PageResultsReport } from './page-results-data';

function report(over: Partial<PageResultsReport>): PageResultsReport {
  return {
    range: { from: '2026-08-01', to: '2026-08-31' },
    pages: [],
    otherPaths: [],
    commerce: true,
    attribution: { placed: 0, traced: 0 },
    totals: { views: 0, visitors: 0, orders: 0, revenueCents: 0 },
    ...over,
  };
}

describe('salesUntraced', () => {
  it('is true when orders were placed and none could be placed on a page', () => {
    expect(salesUntraced(report({ attribution: { placed: 14, traced: 0 } }))).toBe(true);
  });

  it('is false when there were genuinely no sales', () => {
    // A shop with no orders is not an attribution failure, and saying so would
    // explain away a real zero.
    expect(salesUntraced(report({ attribution: { placed: 0, traced: 0 } }))).toBe(false);
  });

  it('is false once even one sale could be placed', () => {
    // Partial coverage is a measurement. The rows are then honestly low, not
    // unknown, and the explanation would be wrong.
    expect(salesUntraced(report({ attribution: { placed: 14, traced: 1 } }))).toBe(false);
  });

  it('is false when the business does not sell at all', () => {
    // The money columns are hidden entirely, so there is nothing to explain.
    expect(salesUntraced(report({ commerce: false, attribution: { placed: 14, traced: 0 } }))).toBe(
      false
    );
  });
});
