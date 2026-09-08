// What the bulk-import preview tells her BEFORE anything is sent.
//
// WHY THIS EXISTS. The preview marked every well-formed line "Ready", including
// lines it could already tell would be refused, and refused every full web
// address including her own — which is the shape every search-console and
// crawler export gives, and this pane exists for exactly that job (issue 400).
// Both are facts about the parse, so they are pinned here rather than left to a
// screen to notice.

import { describe, expect, it } from 'vitest';
import { parseRedirectRows } from './redirects-parse';

const OWN = ['juniper-row.piggles.site', 'juniperrow.com'];

describe('a full web address on one of her own', () => {
  it('is read as the path', () => {
    const [row] = parseRedirectRows('https://juniperrow.com/lookbook-2025, /lookbook', {
      ownHosts: OWN,
    });
    expect(row?.from).toBe('/lookbook-2025');
    expect(row?.state).toBe('ready');
  });

  it('works without a scheme, which is what a spreadsheet often holds', () => {
    const [row] = parseRedirectRows('juniperrow.com/stockists, /where-to-buy', { ownHosts: OWN });
    expect(row?.from).toBe('/stockists');
    expect(row?.state).toBe('ready');
  });

  it('keeps the query, because that is a different address', () => {
    const [row] = parseRedirectRows('https://juniperrow.com/p?id=12, /product/12', {
      ownHosts: OWN,
    });
    expect(row?.from).toBe('/p?id=12');
  });

  it('becomes the home page when there is no path at all', () => {
    const [row] = parseRedirectRows('https://juniperrow.com, /welcome', { ownHosts: OWN });
    expect(row?.from).toBe('/');
  });
});

describe('a web address that is not hers', () => {
  it('is refused, and the message names it', () => {
    const [row] = parseRedirectRows('https://someone-else.com/deals, /deals', { ownHosts: OWN });
    expect(row?.state).toBe('fix');
    expect(row?.message).toContain('someone-else.com');
  });

  it('is refused as a destination too — this platform does not redirect off-site', () => {
    const [row] = parseRedirectRows('/deals, https://someone-else.com/deals', { ownHosts: OWN });
    expect(row?.state).toBe('fix');
  });
});

describe('an old address that already has a rule', () => {
  const existing = new Map([['/sale', '/collections/autumn']]);

  it('says so, and says where it currently goes', () => {
    const [row] = parseRedirectRows('/sale, /collections/winter', { existing });
    expect(row?.state).toBe('already');
    expect(row?.message).toContain('/collections/autumn');
  });

  it('is not counted as ready, so it is never sent', () => {
    const rows = parseRedirectRows('/sale, /collections/winter\n/new, /fresh', { existing });
    expect(rows.filter((row) => row.state === 'ready')).toHaveLength(1);
  });
});

describe('the ordinary rules still hold', () => {
  it('adds the missing slash rather than bouncing the line', () => {
    const [row] = parseRedirectRows('old-pricing, pricing');
    expect(row?.from).toBe('/old-pricing');
    expect(row?.to).toBe('/pricing');
  });

  it('reads a tab-separated paste', () => {
    const [row] = parseRedirectRows('/a\t/b\ttemporary');
    expect(row?.statusCode).toBe(302);
  });

  it('reads an arrow', () => {
    const [row] = parseRedirectRows('/a -> /b');
    expect(row?.to).toBe('/b');
  });

  it('skips blank lines but keeps the real line numbers', () => {
    const rows = parseRedirectRows('\n\n/a, /b');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.line).toBe(3);
  });

  it('refuses a rule that points at itself', () => {
    const [row] = parseRedirectRows('/a, /a');
    expect(row?.state).toBe('fix');
  });

  it('refuses a half-written line', () => {
    const [row] = parseRedirectRows('/a');
    expect(row?.state).toBe('fix');
  });

  it('points a repeat within the paste back at the line that wins', () => {
    const rows = parseRedirectRows('/a, /b\n/a, /c');
    expect(rows[1]?.state).toBe('already');
    expect(rows[1]?.message).toContain('Line 1');
  });
});
