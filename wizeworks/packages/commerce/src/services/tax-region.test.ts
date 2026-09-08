import { describe, expect, it } from 'vitest';
import { taxRegionCode } from './tax-region';

describe('taxRegionCode', () => {
  // The defect this exists for: a shopper types "CA" into State / Region, tax
  // zones are filed as "US-CA", and nothing translated between them — so every
  // US order matched no state zone and was charged no state tax.
  it('turns what a shopper types into the code a tax zone is filed under', () => {
    expect(taxRegionCode('US', 'CA')).toBe('US-CA');
    expect(taxRegionCode('US', 'California')).toBe('US-CA');
    expect(taxRegionCode('US', 'california')).toBe('US-CA');
    expect(taxRegionCode('US', '  New   York ')).toBe('US-NY');
  });

  it('leaves an ISO code alone', () => {
    expect(taxRegionCode('US', 'US-TX')).toBe('US-TX');
    expect(taxRegionCode('US', 'us-tx')).toBe('US-TX');
  });

  it('handles Canada, where the same shape means provinces', () => {
    expect(taxRegionCode('CA', 'ON')).toBe('CA-ON');
    expect(taxRegionCode('CA', 'British Columbia')).toBe('CA-BC');
  });

  it('does not let a code from one country stand for another', () => {
    // "US-CA" on an address whose country is Canada is a contradiction in the
    // address, not something to reconcile.
    expect(taxRegionCode('CA', 'US-CA')).toBeUndefined();
  });

  it('forgives the punctuation people add', () => {
    expect(taxRegionCode('US', 'Washington,')).toBe('US-WA');
    expect(taxRegionCode('US', 'D.C.')).toBe('US-DC');
  });

  // Guessing charges a stranger the wrong state's rate, and nobody can un-charge
  // them. Saying nothing falls back to the country zone, which a shop can see
  // and fix.
  it('says nothing rather than guessing', () => {
    expect(taxRegionCode('US', 'Califnoria')).toBeUndefined();
    expect(taxRegionCode('US', '')).toBeUndefined();
    expect(taxRegionCode('US', null)).toBeUndefined();
    expect(taxRegionCode('US', undefined)).toBeUndefined();
    expect(taxRegionCode('US', 'somewhere nice')).toBeUndefined();
  });

  it('refuses a country that is not a country', () => {
    expect(taxRegionCode('USA', 'CA')).toBeUndefined();
    expect(taxRegionCode('', 'CA')).toBeUndefined();
  });

  it('has no opinion about countries it holds no list for', () => {
    // A bare code still passes through — "DE-BY" is a real thing and the zone
    // either exists or it does not. Only NAMES need a list.
    expect(taxRegionCode('DE', 'BY')).toBe('DE-BY');
    expect(taxRegionCode('DE', 'Bayern')).toBeUndefined();
  });
});
