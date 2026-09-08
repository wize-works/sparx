// Snapshot freeze payload (docs/87 §4) + per-stage numbering format (§9).
// The freeze must be plain JSON (Decimals → numbers) and capture the document
// exactly as it stood: number, totals, party, lines, and the stage label/type.
// Numbering keeps a STABLE suffix while swapping the prefix per stage —
// EST-000123 → INV-000123 — which is the §9 invariant.

import { describe, expect, it } from 'vitest';
import type { BillingDocument, BillingDocumentLine, DocumentStage } from '@wizeworks/db';

import { buildSnapshotPayload } from '../../src/services/billing-snapshot';
import { formatBillingNumber } from '../../src/services/record-numbers';

function makeDoc(overrides: Partial<BillingDocument> = {}): BillingDocument {
  return {
    id: 'doc-1',
    tenantId: 't',
    workflowId: 'w',
    stageId: 's',
    customerId: 'cust-1',
    companyId: null,
    assignedUserId: null,
    number: 'INV-000123',
    numberSeq: 123,
    currency: 'USD',
    billTo: { name: 'Acme Diesel' },
    shipTo: null,
    taxRate: 0.08,
    subtotal: 280,
    discountTotal: 0,
    taxTotal: 8,
    shippingTotal: 15,
    surchargeTotal: 5,
    total: 308,
    depositTotal: 0,
    amountPaid: 0,
    balance: 308,
    status: 'unpaid',
    notes: 'thanks',
    validUntil: null,
    finalizedAt: null,
    voidedAt: null,
    metadata: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    ...overrides,
  } as unknown as BillingDocument;
}

function makeLine(overrides: Partial<BillingDocumentLine> = {}): BillingDocumentLine {
  return {
    id: 'line-1',
    tenantId: 't',
    documentId: 'doc-1',
    lineTypeId: 'lt-part',
    productId: null,
    variantId: 'var-1',
    technicianUserId: null,
    description: 'Injector',
    quantity: 2,
    unitPrice: 50,
    costCents: 3000,
    appliedMarkup: { kind: 'rule', ruleId: 'r1' },
    taxable: true,
    discountAmount: 0,
    taxAmount: 8,
    lineSubtotal: 100,
    lineTotal: 108,
    sortOrder: 0,
    metadata: {},
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as unknown as BillingDocumentLine;
}

function makeStage(overrides: Partial<DocumentStage> = {}): DocumentStage {
  return {
    id: 'stage-final',
    tenantId: 't',
    workflowId: 'w',
    name: 'Invoiced',
    customerLabel: 'Invoice',
    stageType: 'final',
    snapshotOnEnter: true,
    numberOnEnter: true,
    numberPrefix: 'INV-',
    locksEditing: true,
    color: null,
    sortOrder: 3,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('buildSnapshotPayload', () => {
  it('freezes number, totals, party, and the stage label/type', () => {
    const payload = buildSnapshotPayload(makeDoc(), [makeLine()], makeStage());
    expect(payload.document.number).toBe('INV-000123');
    expect(payload.document.totals).toEqual({
      subtotal: 280,
      discountTotal: 0,
      taxTotal: 8,
      shippingTotal: 15,
      surchargeTotal: 5,
      total: 308,
      depositTotal: 0,
      amountPaid: 0,
      balance: 308,
    });
    expect(payload.party).toEqual({
      customerId: 'cust-1',
      companyId: null,
      billTo: { name: 'Acme Diesel' },
      shipTo: null,
      // Null here because this fixture has no issuer, which is the honest
      // answer for a document that never froze one.
      issuedBy: null,
    });
    expect(payload.stage).toEqual({
      id: 'stage-final',
      name: 'Invoiced',
      customerLabel: 'Invoice',
      stageType: 'final',
    });
  });

  it('freezes WHO ISSUED it, not only who was billed', () => {
    // `billTo` and `shipTo` were snapshotted from the start and the seller was
    // not, so the immutable record of a document could not say who sent it —
    // and reprinting one went to the LIVE business, reproducing the exact
    // rewrite `issued_by` exists to prevent. A frozen record that names the
    // customer but not the seller is only half a record.
    const issuer = {
      siteName: 'Juniper Row',
      legalName: 'Juniper Row Textiles LLC',
      address: { line1: '1184 SE Ash St', city: 'Portland', region: 'OR' },
    };
    const payload = buildSnapshotPayload(
      makeDoc({ issuedBy: issuer }),
      [],
      makeStage({ stageType: 'final' })
    );
    expect(payload.party.issuedBy).toEqual(issuer);
  });

  it('freezes each line with its markup snapshot and numeric values', () => {
    const payload = buildSnapshotPayload(makeDoc(), [makeLine()], makeStage());
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0]).toMatchObject({
      description: 'Injector',
      quantity: 2,
      unitPrice: 50,
      costCents: 3000,
      appliedMarkup: { kind: 'rule', ruleId: 'r1' },
      taxable: true,
      lineTotal: 108,
    });
  });

  it('serializes validUntil to ISO and is JSON round-trippable', () => {
    const payload = buildSnapshotPayload(
      makeDoc({ validUntil: new Date('2026-07-01T00:00:00.000Z') }),
      [],
      makeStage()
    );
    expect(payload.document.validUntil).toBe('2026-07-01T00:00:00.000Z');
    // The whole freeze must be plain JSON (no Decimal/Date objects left).
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });
});

describe('formatBillingNumber (§9 stable suffix, prefix swap)', () => {
  it('keeps the same suffix across stage prefixes', () => {
    expect(formatBillingNumber('EST-', 123)).toBe('EST-000123');
    expect(formatBillingNumber('INV-', 123)).toBe('INV-000123');
  });

  it('pads the sequence to six digits and concatenates the prefix verbatim', () => {
    expect(formatBillingNumber('INV-', 1)).toBe('INV-000001');
    expect(formatBillingNumber('RO#', 42)).toBe('RO#000042');
  });
});
