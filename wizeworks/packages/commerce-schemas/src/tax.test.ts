// The two rules that decide whether a shop takes sales tax off a shopper.
//
// Both exist because of one incident: five industry starters installed
// California, Texas and New York switched ON for every shop that picked them,
// so a Denver studio that had never traded outside Colorado was set collecting
// in three states (issue 429). It stayed invisible for months because nothing
// charged tax at all (issue 428) — the afternoon that was fixed, it was money.

import { describe, expect, it } from 'vitest';

import { CreateTaxZoneInput, zoneIsCollecting } from './tax';

const PLACE = { country: 'US', region: 'US-CA', nexusType: 'physical' } as const;

describe('CreateTaxZoneInput', () => {
  it('does not start collecting when the caller never mentioned it', () => {
    // The whole defect in one line. This used to parse to `isActive: true`, so a
    // preset that simply did not think about collection got a shop charging.
    expect(CreateTaxZoneInput.parse(PLACE).isActive).toBe(false);
  });

  it('keeps a request to collect rather than stripping it, so it can be refused', () => {
    // `taxService.createZone` refuses this: a place is always created switched
    // off. The key stays on the schema precisely so the refusal is possible —
    // dropping it would let Zod strip it and silently do something other than
    // what the caller asked for.
    expect(CreateTaxZoneInput.parse({ ...PLACE, isActive: true }).isActive).toBe(true);
  });

  it('keeps the registration details a shop enters', () => {
    const parsed = CreateTaxZoneInput.parse({
      ...PLACE,
      registrationNumber: 'CA-SR-118-4470921',
      registeredAt: '2026-01-15T00:00:00.000Z',
    });
    expect(parsed.registrationNumber).toBe('CA-SR-118-4470921');
    expect(parsed.registeredAt).toBe('2026-01-15T00:00:00.000Z');
  });
});

describe('zoneIsCollecting', () => {
  it('charges where a person switched it on', () => {
    expect(zoneIsCollecting({ isActive: true, activatedAt: '2026-09-05T10:00:00.000Z' })).toBe(
      true
    );
  });

  it('refuses a place switched on with nobody behind it', () => {
    // This is the seeded row. It looks identical to a real one on every screen,
    // which is exactly why the switch alone cannot be the test.
    expect(zoneIsCollecting({ isActive: true, activatedAt: null })).toBe(false);
  });

  it('stops charging when a place is switched off, and does not forget it once did', () => {
    // The stamp is history and stays put: "this shop collected here from March"
    // is still true after it stops. Only the switch decides today.
    expect(zoneIsCollecting({ isActive: false, activatedAt: '2026-03-01T00:00:00.000Z' })).toBe(
      false
    );
  });

  it('charges nothing on a place nobody has touched', () => {
    expect(zoneIsCollecting({ isActive: false, activatedAt: null })).toBe(false);
  });
});
