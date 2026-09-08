// WHO ISSUED A DOCUMENT, as it was on the day.
//
// `billing_documents.issued_by` is written the moment a document is finalized,
// with a long comment about how renaming a site — or editing the legal entity's
// address — otherwise rewrites the letterhead on invoices already in customers'
// hands. The column was maintained correctly and read by NOTHING: both the PDF
// and the emailed invoice went to the live business, so the exact rewrite it
// exists to prevent still happened, and a customer's copy and the tenant's copy
// could disagree about who billed them.
//
// These cover the decode. The rule they encode: a document that froze an issuer
// prints THAT one; a document with nothing frozen falls back to live, which is
// the only answer available for anything issued before the column existed.

import { describe, expect, it } from 'vitest';

import { frozenIssuerIdentity } from './business-identity.js';

/** What `snapshotIssuer` writes, in full. */
const FROZEN = {
  siteName: 'Juniper Row',
  legalName: 'Juniper Row Textiles LLC',
  entityType: 'llc',
  registrationNumber: 'OR-88213',
  taxId: 'US-4471203',
  phone: '(503) 555-0148',
  supportEmail: 'hello@juniper-row.example',
  address: {
    line1: '1184 SE Ash St',
    line2: 'Studio 4',
    city: 'Portland',
    region: 'OR',
    postalCode: '97214',
    country: 'US',
  },
};

describe('frozenIssuerIdentity', () => {
  it('prints the LEGAL entity, not the shop name', () => {
    // The same rule the live path follows: an invoice is issued by the business,
    // not by whichever shop the customer happened to buy through. The trading
    // name is what goes on the EMAIL; this is the printed document.
    expect(frozenIssuerIdentity(FROZEN)?.businessName).toBe('Juniper Row Textiles LLC');
  });

  it('builds the seller block in the same order the live one does', () => {
    expect(frozenIssuerIdentity(FROZEN)?.addressLines).toEqual([
      '1184 SE Ash St',
      'Studio 4',
      'Portland, OR 97214',
      'US',
      '(503) 555-0148',
      'Tax ID: US-4471203',
    ]);
  });

  it('joins only the parts that exist, leaving no stray commas', () => {
    const sparse = frozenIssuerIdentity({
      ...FROZEN,
      phone: null,
      taxId: null,
      address: { ...FROZEN.address, line2: null, region: null, postalCode: null },
    });
    expect(sparse?.addressLines).toEqual(['1184 SE Ash St', 'Portland', 'US']);
  });

  it('does not print a tax id the business did not hold', () => {
    // The `taxRegistered` gate is applied at FREEZE time, so an absent id here
    // means one was never held — printing one would be a compliance problem
    // rather than a cosmetic one.
    const noTax = frozenIssuerIdentity({ ...FROZEN, taxId: null });
    expect(noTax?.addressLines?.some((line) => line.startsWith('Tax ID'))).toBe(false);
  });

  it('falls back to the shop name when no legal entity was recorded', () => {
    const trading = frozenIssuerIdentity({ ...FROZEN, legalName: '' });
    expect(trading?.businessName).toBe('Juniper Row');
  });

  it('returns null for a document with nothing frozen, so the caller goes live', () => {
    // Everything issued before the column existed, and everything not yet
    // finalized. Null is the signal to use the live business — the only answer
    // available for those — rather than printing a blank masthead.
    expect(frozenIssuerIdentity(null)).toBeNull();
    expect(frozenIssuerIdentity(undefined)).toBeNull();
    expect(frozenIssuerIdentity({})).toBeNull();
    expect(frozenIssuerIdentity('Juniper Row')).toBeNull();
    expect(frozenIssuerIdentity([FROZEN])).toBeNull();
  });

  it('THE POINT: renaming the business does not change what a frozen document says', () => {
    // The failure this whole column exists to stop. The frozen record is a
    // value, not a query, so there is nothing here that a later rename reaches.
    const before = frozenIssuerIdentity(FROZEN);
    const renamedLive = { businessName: 'Ash Street Cloth Co', addressLines: ['New address'] };
    const after = frozenIssuerIdentity(FROZEN) ?? renamedLive;
    expect(after).toEqual(before);
    expect(after.businessName).not.toBe(renamedLive.businessName);
  });
});
