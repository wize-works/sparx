import { describe, expect, it } from 'vitest';
import { rankRecords, recordRank, type Entry } from './launcher-match';

/** A record row, shaped the way `useRecordEntries` builds one. */
function record(label: string, group: string, subtitle?: string): Entry {
  return {
    id: `record:${label}`,
    group,
    label,
    ...(subtitle === undefined ? {} : { subtitle }),
    run: () => undefined,
  };
}

describe('ranking record results against what was typed', () => {
  it('puts the person she named above a page whose letters happen to match', () => {
    // Measured on P03: typing "Priya" returned Privacy Policy first — two edits
    // away, and the search server is typo-tolerant on purpose — then a segment,
    // then the three customers actually called Priya. The highlight starts on the
    // first row and Enter takes it, so a policy page opened.
    const ranked = rankRecords(
      [
        record('Privacy Policy', 'Pages', 'privacy-policy'),
        record('B2B Fleet', 'Segments', 'b2b-fleet'),
        record('Priya Nandakumar', 'Customers', 'Loom & Larder'),
        record('Priya Anand', 'Customers', 'priya.anand@example.com'),
      ],
      'priya'
    );

    expect(ranked.map((row) => row.label)).toEqual([
      'Priya Nandakumar',
      'Priya Anand',
      'Privacy Policy',
      'B2B Fleet',
    ]);
  });

  it('puts a customer above the text of a review she wrote', () => {
    // The same shape with a different query: "Marguerite" returned her review's
    // opening line first and Marguerite herself second.
    const ranked = rankRecords(
      [
        record(
          'Sized down and it still swallows me, in a good way',
          'Reviews',
          'The Ash Overshirt'
        ),
        record('Marguerite Adeyemi', 'Customers', 'marguerite.adeyemi@example.com'),
        record('#O-000014', 'Orders', 'Marguerite Adeyemi · placed'),
      ],
      'marguerite'
    );

    expect(ranked[0]?.label).toBe('Marguerite Adeyemi');
    // The order still matches, on its subtitle, so it outranks the review — but
    // it stays below the person, which is who was asked for.
    expect(ranked[1]?.label).toBe('#O-000014');
  });

  it('keeps rows it cannot score at all, in the order the server sent them', () => {
    // Typo tolerance is why a mistyped query finds anything, so a row the client
    // sees no reason for is demoted, never dropped.
    const ranked = rankRecords(
      [record('Alpha', 'Pages'), record('Beta', 'Pages'), record('Priya Anand', 'Customers')],
      'priya'
    );
    expect(ranked.map((row) => row.label)).toEqual(['Priya Anand', 'Alpha', 'Beta']);
  });

  it('does not reorder anything when nothing was typed', () => {
    const rows = [record('Alpha', 'Pages'), record('Beta', 'Pages')];
    expect(rankRecords(rows, '   ')).toEqual(rows);
  });

  it('rates the row’s own name above the line under it', () => {
    const byName = record('Marlow Knit', 'Products', 'marlow-knit');
    const bySubtitle = record('#O-000014', 'Orders', 'Marlow Knit · placed');
    expect(recordRank(byName, 'marlow')).toBeGreaterThan(recordRank(bySubtitle, 'marlow'));
  });

  it('ignores the group, which on a record is just the entity’s own name', () => {
    // `score` counts a group match for SURFACES on purpose — typing "customers"
    // should reach the Customers app. On a record it would score every order in
    // the shop equally and say nothing about which one was meant.
    expect(recordRank(record('#O-000014', 'Orders', 'Marguerite · placed'), 'orders')).toBe(0);
  });

  it('needs every meaningful word of a phrase, like the surface ladder does', () => {
    const row = record('Priya Nandakumar', 'Customers', 'Loom & Larder');
    expect(recordRank(row, 'priya nandakumar')).toBeGreaterThan(0);
    expect(recordRank(row, 'priya adeyemi')).toBe(0);
  });
});
