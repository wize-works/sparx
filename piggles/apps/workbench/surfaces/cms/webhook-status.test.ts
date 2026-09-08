import { describe, expect, it } from 'vitest';
import { webhookState } from './webhook-status';
import type { WebhookHealth } from './webhooks-data';

function health(patch: Partial<WebhookHealth>): WebhookHealth {
  return {
    delivered: 0,
    failed: 0,
    pending: 0,
    lastAttemptAt: '2026-09-05T01:20:00.000Z',
    lastOutcome: 'delivered',
    windowDays: 7,
    ...patch,
  };
}

describe('webhookState', () => {
  it('says paused before anything else, however healthy it looks', () => {
    expect(webhookState(false, health({ delivered: 9 })).label).toBe('Paused');
  });

  it('separates "nothing tried" from "everything worked"', () => {
    const state = webhookState(true, health({ lastAttemptAt: null, lastOutcome: null }));
    expect(state.label).toBe('Nothing sent yet');
    expect(state.tone).toBe('info');
  });

  it('treats a missing health payload as untested, not as working', () => {
    expect(webhookState(true, undefined).label).toBe('Nothing sent yet');
  });

  // The bug this file was rewritten for: a queued message is not a delivered
  // one, and the first version reported "Working. 0 messages arrived."
  it('never says working when the only message is still queued', () => {
    const state = webhookState(true, health({ pending: 1, lastOutcome: 'pending' }));
    expect(state.label).toBe('On its way');
    expect(state.detail).not.toContain('0 messages');
  });

  it('reports total failure as an error', () => {
    const state = webhookState(true, health({ failed: 3, lastOutcome: 'failed' }));
    expect(state.label).toBe('Not getting through');
    expect(state.tone).toBe('error');
    expect(state.detail).toContain('3 messages');
  });

  it('reports partial failure as a warning and gives both numbers', () => {
    const state = webhookState(true, health({ delivered: 4, failed: 1 }));
    expect(state.label).toBe('Some are failing');
    expect(state.tone).toBe('warning');
    expect(state.detail).toContain('4 messages');
    expect(state.detail).toContain('1 did not');
  });

  it('says working only when something actually arrived', () => {
    const state = webhookState(true, health({ delivered: 12 }));
    expect(state.label).toBe('Working');
    expect(state.tone).toBe('success');
  });

  it('does not claim recent success when every attempt predates the window', () => {
    const state = webhookState(true, health({ delivered: 0, failed: 0, pending: 0 }));
    expect(state.label).toBe('Quiet lately');
    expect(state.detail).toContain('arrived safely');
  });

  it('uses the singular for one message', () => {
    expect(webhookState(true, health({ delivered: 1 })).detail).toContain('1 message arrived');
  });
});
