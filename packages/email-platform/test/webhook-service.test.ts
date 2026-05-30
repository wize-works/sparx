import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyMailgunSignature, ingest } from '../src/services/webhook-service';

describe('verifyMailgunSignature', () => {
  const key = 'test-signing-key';
  const timestamp = '1700000000';
  const token = 'abc123';
  const good = createHmac('sha256', key)
    .update(timestamp + token)
    .digest('hex');

  it('accepts a correctly-signed payload', () => {
    expect(verifyMailgunSignature({ timestamp, token, signature: good }, key)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    expect(verifyMailgunSignature({ timestamp, token, signature: 'deadbeef' }, key)).toBe(false);
  });

  it('rejects the wrong signing key', () => {
    expect(verifyMailgunSignature({ timestamp, token, signature: good }, 'other-key')).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(verifyMailgunSignature({ timestamp: '', token, signature: good }, key)).toBe(false);
  });
});

describe('ingest attribution short-circuits (no DB)', () => {
  it('drops events it does not track', async () => {
    const result = await ingest({ event: 'list_member_uploaded' });
    expect(result).toEqual({ handled: false, reason: 'unknown_event' });
  });

  it('drops trackable events with no tenant attribution', async () => {
    const result = await ingest({ event: 'delivered', recipient: 'a@b.com', 'user-variables': {} });
    expect(result).toEqual({ handled: false, reason: 'no_tenant', type: 'delivered' });
  });

  it('maps a permanent failure to a bounce (still needs a tenant to persist)', async () => {
    const result = await ingest({ event: 'failed', severity: 'permanent', 'user-variables': {} });
    expect(result).toEqual({ handled: false, reason: 'no_tenant', type: 'bounced' });
  });
});
