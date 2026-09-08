import { describe, expect, it } from 'vitest';
import { checkoutSummary, gatewayState } from './providers-data';
import type { GatewayDescriptor, PaymentConfig } from './providers-data';

function gateway(patch: Partial<GatewayDescriptor>): GatewayDescriptor {
  return {
    id: 'square',
    name: 'Square',
    blurb: 'Use your existing Square account.',
    onboarding: 'api_keys',
    checkout: 'redirect',
    capabilities: { refunds: true, capture: true, paymentLinks: true, webhooks: true },
    credentialFields: [],
    environments: false,
    sparxFee: false,
    feeNote: 'No fee.',
    regions: [],
    ...patch,
  };
}

function config(patch: Partial<PaymentConfig>): PaymentConfig {
  return {
    gatewayId: 'square',
    isActive: true,
    onboardedAt: null,
    sparxPay: {
      accountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    },
    ...patch,
  };
}

const MANUAL = gateway({
  id: 'manual',
  name: 'Manual payments',
  onboarding: 'manual',
  checkout: 'none',
  feeNote: 'No fee. No online card processing.',
});

describe('gatewayState', () => {
  it('says a live card gateway is taking payments', () => {
    const state = gatewayState(gateway({}), config({}), undefined);
    expect(state.label).toBe('Active — taking payments');
    expect(state.tone).toBe('success');
  });

  // The defect this file was written for. Manual payments is SWITCHED ON and
  // charges nothing, and the badge said "Active — taking payments" in green two
  // lines under the pane's own sentence "nothing is charged online". An
  // online-only shop reading it would take every order unpaid.
  it('never claims a gateway with no online checkout is taking payments', () => {
    const state = gatewayState(MANUAL, config({ gatewayId: 'manual' }), undefined);
    expect(state.label).not.toContain('taking payments');
    expect(state.label).toBe('Active — no card payments');
  });

  it('colors "active and charging" differently from "active and charging nothing"', () => {
    const charging = gatewayState(gateway({}), config({}), undefined);
    const notCharging = gatewayState(MANUAL, config({ gatewayId: 'manual' }), undefined);
    expect(charging.tone).not.toBe(notCharging.tone);
  });

  it('an unbuilt gateway is never Available, whatever else is true of it', () => {
    const state = gatewayState(
      gateway({ id: 'paypal', availability: 'coming_soon' }),
      config({ gatewayId: 'paypal' }),
      undefined
    );
    expect(state.label).toBe('Coming soon');
  });

  it('never names a color for a row nothing has happened to', () => {
    // root RULE #4: naming neutral IS choosing a color, and choosing it made
    // "Available" and "Coming soon" the same grey pill. An absent tone is a
    // colorless badge, which is the right ink for a row carrying no state.
    expect(gatewayState(gateway({}), undefined, undefined).tone).toBeUndefined();
    expect(gatewayState(gateway({ availability: 'coming_soon' }), undefined, undefined).tone).toBe(
      'info'
    );
  });

  it('separates chosen-but-not-ready from active', () => {
    const state = gatewayState(gateway({}), config({ isActive: false }), undefined);
    expect(state.label).toBe('Chosen — add your keys to go live');
    expect(state.tone).toBe('info');
  });

  it('warns when keys are saved on a gateway checkout does not use', () => {
    const state = gatewayState(gateway({}), config({ gatewayId: 'stripe_direct' }), {
      gatewayId: 'square',
      hasSecrets: true,
    } as never);
    expect(state.label).toBe('Keys saved — not your active provider');
  });
});

describe('checkoutSummary', () => {
  it('says nothing at all when no provider is live', () => {
    expect(checkoutSummary(gateway({}), false)).toBeNull();
    expect(checkoutSummary(undefined, true)).toBeNull();
  });

  it('agrees with the row it summarises', () => {
    expect(checkoutSummary(gateway({}), true)?.label).toBe('Taking payments');
    expect(checkoutSummary(MANUAL, true)?.label).toBe('No card payments');
  });
});
