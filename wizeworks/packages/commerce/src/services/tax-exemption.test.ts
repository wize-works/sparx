import { describe, expect, it } from 'vitest';
import { coveringExemption, exemptionCovers } from './tax-exemption';

const CA = { country: 'US', region: 'US-CA' };
const US = { country: 'US', region: null };
const TODAY = new Date('2026-09-05T12:00:00Z');

function cert(jurisdiction: string, from = '2026-01-01', to: string | null = null) {
  return {
    jurisdiction,
    validFrom: new Date(`${from}T00:00:00Z`),
    validTo: to ? new Date(`${to}T23:59:59Z`) : null,
  };
}

describe('exemptionCovers', () => {
  it('covers the state it names', () => {
    expect(exemptionCovers(CA, cert('US-CA'), TODAY)).toBe(true);
  });

  it('does not let one state stand for another', () => {
    expect(exemptionCovers({ country: 'US', region: 'US-TX' }, cert('US-CA'), TODAY)).toBe(false);
  });

  // A California resale certificate says nothing about the country as a whole.
  it('does not let a state certificate cover the country zone', () => {
    expect(exemptionCovers(US, cert('US-CA'), TODAY)).toBe(false);
  });

  it('lets a country certificate cover a state inside it', () => {
    expect(exemptionCovers(CA, cert('US'), TODAY)).toBe(true);
  });

  it('is not fussy about case or stray spaces on a typed certificate', () => {
    expect(exemptionCovers(CA, cert(' us-ca '), TODAY)).toBe(true);
  });

  it('has not started yet before its first day', () => {
    expect(exemptionCovers(CA, cert('US-CA', '2026-12-01'), TODAY)).toBe(false);
  });

  it('stops covering after it runs out', () => {
    expect(exemptionCovers(CA, cert('US-CA', '2026-01-01', '2026-06-30'), TODAY)).toBe(false);
  });

  it('never runs out when it has no end date, which is the usual shape', () => {
    expect(exemptionCovers(CA, cert('US-CA', '2026-01-01', null), TODAY)).toBe(true);
  });
});

describe('coveringExemption', () => {
  it('hands back WHICH certificate exempted the order, not just that one did', () => {
    // The order has to record it or the shop cannot answer an auditor.
    const expired = cert('US-CA', '2020-01-01', '2021-01-01');
    const good = cert('US-CA');
    expect(coveringExemption(CA, [expired, good], TODAY)).toBe(good);
  });

  it('says nothing when the customer has none that fit', () => {
    expect(coveringExemption(CA, [cert('US-TX')], TODAY)).toBeNull();
    expect(coveringExemption(CA, [], TODAY)).toBeNull();
  });
});
